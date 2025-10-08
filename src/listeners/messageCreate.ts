import { Message, TextBasedChannel } from 'discord.js';
import { buildPassiveRoastPrompt, RecentMessage } from '../context/builder.ts';
import { ingestMessage } from '../context/ingest.ts';
import { config } from '../config.ts';
import { chat, LLMRequestError, LLMTimeoutError } from '../llm.ts';
import { log } from '../logger.ts';
import { sanitizeForPrompt } from '../util/text.ts';
import { getChannelPassiveInterval } from '../db.ts';

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
  state.buffer.push(toRecentMessage(message));
  trimBuffer(state.buffer, config.passiveContextMessages * 2);
  state.count += 1;

  if (state.busy) return;

  const interval = resolvePassiveInterval(message.guildId, message.channelId);
  if (state.count < interval) {
    return;
  }

  const target = pickTarget(state);
  if (!target) {
    state.count = 0;
    return;
  }

  const result = await runPassiveRoast({
    guildId: message.guildId,
    channel: message.channel,
    state,
    target,
    reason: 'interval-threshold'
  });

  if (!result.sent) {
    log.debug({ reason: result.reason, channelId: message.channelId }, 'passive roast not sent');
  }
}

export async function triggerPassiveRoastForChannel(
  guildId: string,
  channel: TextBasedChannel,
  options: { targetUserId?: string; reason?: string; minContextMessages?: number } = {}
): Promise<{ sent: boolean; reason: string; targetUserId?: string }> {
  if (!channel.isTextBased()) {
    return { sent: false, reason: 'channel-not-text' };
  }

  const state = getChannelState(channel.id);
  const minMessages = Math.max(options.minContextMessages ?? config.passiveContextMessages, 1);
  await hydrateStateFromChannel(channel, state, minMessages);

  let target: RecentMessage | null = null;
  if (options.targetUserId) {
    target = findTargetInState(state, options.targetUserId);
  }
  if (!target) {
    target = pickTarget(state);
  }

  if (!target) {
    return { sent: false, reason: 'no-target' };
  }

  const result = await runPassiveRoast({
    guildId,
    channel,
    state,
    target,
    reason: options.reason ?? 'manual-trigger'
  });

  return result;
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
    if (entry.userId === state.lastTargetId) continue;
    if (!entry.content) continue;
    return entry;
  }
  return reversed.find((entry) => Boolean(entry.content)) ?? null;
}

function findTargetInState(state: ChannelState, userId: string): RecentMessage | null {
  const reversed = [...state.buffer].reverse();
  return reversed.find((entry) => entry.userId === userId && entry.content) ?? null;
}

function toRecentMessage(message: Message): RecentMessage {
  return {
    authorName: message.member?.displayName ?? message.author.username,
    userId: message.author.id,
    content: sanitizeForPrompt(message.cleanContent)
  };
}

async function hydrateStateFromChannel(channel: TextBasedChannel, state: ChannelState, minMessages: number) {
  if (state.buffer.length >= minMessages) {
    return;
  }

  if (typeof channel.messages?.fetch !== 'function') {
    return;
  }

  const limit = Math.min(Math.max(minMessages * 2, config.passiveContextMessages * 2), 30);
  const fetched = await channel.messages.fetch({ limit });
  const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const mapped = sorted
    .map((msg) => {
      if (!msg.cleanContent?.trim()) return null;
      return {
        authorName: msg.member?.displayName ?? msg.author.username,
        userId: msg.author.id,
        content: sanitizeForPrompt(msg.cleanContent)
      } satisfies RecentMessage;
    })
    .filter((item): item is RecentMessage => Boolean(item));

  if (mapped.length) {
    state.buffer = mapped.slice(-config.passiveContextMessages * 2);
  }
}

function resolvePassiveInterval(guildId: string, channelId: string): number {
  const stored = getChannelPassiveInterval(guildId, channelId);
  if (stored) {
    return Math.max(1, stored.interval);
  }
  return config.passiveInterval;
}

async function runPassiveRoast(params: {
  guildId: string;
  channel: TextBasedChannel;
  state: ChannelState;
  target: RecentMessage;
  reason: string;
}): Promise<{ sent: boolean; reason: string; targetUserId?: string }> {
  const { guildId, channel, state, target, reason } = params;

  if (!channel.isTextBased() || typeof (channel as { send?: unknown }).send !== 'function') {
    return { sent: false, reason: 'channel-no-send' };
  }

  if (state.busy) {
    return { sent: false, reason: 'busy' };
  }

  state.busy = true;
  state.count = 0;

  try {
    const prompt = buildPassiveRoastPrompt({
      guildId,
      targetUserId: target.userId,
      targetDisplayName: target.authorName,
      channelHistory: state.buffer
    });

    log.info(
      {
        scope: 'passive-roast',
        guildId,
        channelId: channel.id,
        targetUserId: target.userId,
        historySize: state.buffer.length,
        contextTokens: prompt.context.tokensUsed,
        reason
      },
      'built passive roast prompt'
    );

    const response = await chat(
      [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ],
      { temperature: 0.9, timeoutMs: config.llmTimeoutMs }
    );

    if (!response) {
      return { sent: false, reason: 'empty-response' };
    }

    const textChannel = channel as TextBasedChannel & {
      send: (content: string) => Promise<unknown>;
    };
    await textChannel.send(response);
    state.lastTargetId = target.userId;
    return { sent: true, reason: 'sent', targetUserId: target.userId };
  } catch (error) {
    if (error instanceof LLMTimeoutError) {
      log.warn({ err: error, guildId, channelId: channel.id }, 'passive roast timed out');
      return { sent: false, reason: 'timeout' };
    }
    if (error instanceof LLMRequestError) {
      log.error({ err: error, guildId, channelId: channel.id }, 'passive roast failed');
      return { sent: false, reason: 'llm-error' };
    }
    log.error({ err: error, guildId, channelId: channel.id }, 'unexpected passive roast error');
    return { sent: false, reason: 'unknown-error' };
  } finally {
    state.busy = false;
  }
}
