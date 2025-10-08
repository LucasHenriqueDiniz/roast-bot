import { config } from '../config.ts';
import { countMessagesSince, getRecentMessagesForUser, getUserProfile, upsertUserProfile } from '../db.ts';
import { log } from '../logger.ts';
import { extractHeuristics } from './heuristics.ts';
import { composeProfileSummary } from './profile.ts';

export function refreshUserProfile(params: {
  guildId: string;
  userId: string;
  displayName?: string;
  onlyIfStale?: boolean;
}): { updated: boolean; timestamp: number } | null {
  const { guildId, userId, displayName, onlyIfStale = false } = params;
  const existing = getUserProfile(guildId, userId);
  const now = Date.now();

  if (onlyIfStale && existing) {
    if (now - existing.lastUpdateTs < config.profileRefreshMinIntervalMs) {
      return { updated: false, timestamp: existing.lastUpdateTs };
    }

    const since = countMessagesSince(guildId, userId, existing.lastUpdateTs);
    if (since < config.profileRefreshMinMessages) {
      return { updated: false, timestamp: existing.lastUpdateTs };
    }
  }

  const messages = getRecentMessagesForUser(guildId, userId, config.profileRecentMessageLimit);
  if (!messages.length) {
    return existing ? { updated: false, timestamp: existing.lastUpdateTs } : null;
  }

  const heuristics = extractHeuristics(messages);
  const { summary, quirks } = composeProfileSummary(heuristics, { displayName });

  const quirksJson = JSON.stringify(quirks.slice(0, 12));
  upsertUserProfile(guildId, userId, summary, quirksJson, now);

  log.info(
    {
      scope: 'profile-refresh',
      guildId,
      userId,
      totalMessages: heuristics.totalMessages,
      topics: heuristics.topics.slice(0, 5),
      emojiRank: heuristics.emojiRank.slice(0, 3)
    },
    'updated user profile summary'
  );

  return { updated: true, timestamp: now };
}
