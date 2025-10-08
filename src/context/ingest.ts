import { config } from '../config.ts';
import { decaySnippets, insertUserSnippet, pruneSnippets, storeMessage } from '../db.ts';
import { log } from '../logger.ts';
import { refreshUserProfile } from './updater.ts';

export type IngestedMessage = {
  guildId: string;
  channelId: string;
  userId: string;
  displayName?: string;
  content: string;
  timestamp: number;
};

const pendingCounters = new Map<string, number>();

export function ingestMessage(message: IngestedMessage) {
  storeMessage(message.guildId, message.channelId, message.userId, message.timestamp, message.content);
  captureSnippetIfInteresting(message);
  bumpCounter(message.guildId, message.userId);
  maybeRefreshProfile(message);
}

export function forceRefreshProfile(guildId: string, userId: string, displayName?: string) {
  log.info({ guildId, userId }, 'manual profile refresh requested');
  const result = refreshUserProfile({ guildId, userId, displayName });
  if (result?.updated) {
    decaySnippets(guildId, userId, config.snippetDecayFactor);
    pruneSnippets(guildId, userId, config.snippetMinScore);
  }
  pendingCounters.delete(makeKey(guildId, userId));
}

function captureSnippetIfInteresting(message: IngestedMessage) {
  const excerpt = buildSnippetExcerpt(message.content);
  if (!excerpt) return;

  const tags = extractSnippetTags(message.content);
  insertUserSnippet(message.guildId, message.userId, message.timestamp, excerpt, tags, 1);
}

function buildSnippetExcerpt(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length < 40 || trimmed.length > 280) return null;
  if (/^https?:\/\//i.test(trimmed)) return null;
  if (trimmed.split(/\s+/).length < 6) return null;
  return trimmed.slice(0, 280);
}

function extractSnippetTags(content: string): string[] {
  const tokens = content
    .toLowerCase()
    .replace(/[!?.,;:()"'`]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3)
    .slice(0, 12);

  const unique: string[] = [];
  for (const token of tokens) {
    if (!unique.includes(token)) {
      unique.push(token);
    }
    if (unique.length >= 5) break;
  }
  return unique;
}

function bumpCounter(guildId: string, userId: string) {
  const key = makeKey(guildId, userId);
  pendingCounters.set(key, (pendingCounters.get(key) ?? 0) + 1);
}

function maybeRefreshProfile(message: IngestedMessage) {
  const key = makeKey(message.guildId, message.userId);
  const pending = pendingCounters.get(key) ?? 0;
  if (pending < config.profileRefreshMinMessages) return;

  pendingCounters.set(key, 0);

  const result = refreshUserProfile({
    guildId: message.guildId,
    userId: message.userId,
    displayName: message.displayName,
    onlyIfStale: true
  });
  if (!result) return;

  if (result.updated) {
    decaySnippets(message.guildId, message.userId, config.snippetDecayFactor);
    pruneSnippets(message.guildId, message.userId, config.snippetMinScore);
  }
}

function makeKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}
