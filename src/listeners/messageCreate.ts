import { Message } from 'discord.js';
import { buildPassiveRoastPrompt, RecentMessage } from '../context/builder.ts';
import { ingestMessage } from '../context/ingest.ts';
import { config } from '../config.ts';
import { chat } from '../llm.ts';
import { log } from '../logger.ts';
import { sanitizeForPrompt } from '../util/text.ts';

type ChannelState = {
  count: number;
  buffer: RecentMessage[];
  busy: boolean;
  lastTargetId?: string;
};

const channelStates = new Map<string, ChannelState>();

export async function onMessageCreate(message: Message) {
  if (!message.guildId) return;
  if (message.author.bot) return;
  if (config.allowedGuildId && message.guildId !== config.allowedGuildId) return;
  if (!message.channel.isTextBased()) return;

  const clean = message.cleanContent?.trim();
  if (!clean) return;

  ingestMessage({
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    displayName: message.member?.displayName ?? message.author.username,
    content: message.cleanContent,
    timestamp: message.createdTimestamp
  });

  const state = getChannelState(message.channelId);
  state.buffer.push({
    authorName: message.member?.displayName ?? message.author.username,
    userId: message.author.id,
    content: sanitizeForPrompt(message.cleanContent)
  });
  trimBuffer(state.buffer, config.passiveContextMessages * 2);
  state.count += 1;

  if (state.busy) return;
  if (state.count < config.passiveInterval) return;

  const target = pickTarget(state);
  if (!target) {
    state.count = 0;
    return;
  }

  state.count = 0;
  state.busy = true;

  try {
    const prompt = buildPassiveRoastPrompt({
      guildId: message.guildId,
      targetUserId: target.userId,
      targetDisplayName: target.authorName,
      channelHistory: state.buffer
    });

    log.info(
      {
        scope: 'passive-roast',
        guildId: message.guildId,
        channelId: message.channelId,
        targetUserId: target.userId,
        historySize: state.buffer.length,
        contextTokens: prompt.context.tokensUsed
      },
      'built passive roast prompt'
    );

    const response = await chat(
      [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ],
      { temperature: 0.9 }
    );

    if (response) {
      const channel = message.channel;
      if ('send' in channel && typeof channel.send === 'function') {
        await channel.send(response);
      }
      state.lastTargetId = target.userId;
    }
  } catch (error) {
    log.error({ err: error }, 'passive roast failed');
  } finally {
    state.busy = false;
  }
}

function getChannelState(channelId: string): ChannelState {
  let state = channelStates.get(channelId);
  if (!state) {
    state = { count: 0, buffer: [], busy: false };
    channelStates.set(channelId, state);
  }
  return state;
}

function trimBuffer(buffer: RecentMessage[], max: number) {
  while (buffer.length > max) {
    buffer.shift();
  }
}

function pickTarget(state: ChannelState): RecentMessage | null {
  const reversed = [...state.buffer].reverse();
  for (const entry of reversed) {
    if (entry.userId === state.lastTargetId) {
      continue;
    }
    return entry;
  }
  return reversed[0] ?? null;
}
