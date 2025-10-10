import { Guild, TextBasedChannel } from 'discord.js';
import { config } from '../config.ts';
import { ingestMessage } from './ingest.ts';
import { isLikelyNoise } from './filters.ts';
import { log } from '../logger.ts';

export type BackfillResult = {
  collected: number;
  reused: number;
  scannedChannels: number;
  errors: number;
};

const FETCH_BATCH_SIZE = 100;

export async function backfillUserMessages(
  guild: Guild,
  userId: string,
  options: { limit?: number } = {}
): Promise<BackfillResult> {
  const limit = Math.max(1, options.limit ?? config.profileRecentMessageLimit);

  const channels = await guild.channels.fetch();
  const candidates: TextBasedChannel[] = [];
  for (const channel of channels.values()) {
    if (!channel) continue;
    if (typeof channel.isTextBased !== 'function' || !channel.isTextBased()) continue;
    if ('viewable' in channel && !channel.viewable) continue;
    if (typeof (channel as TextBasedChannel).messages?.fetch !== 'function') continue;
    candidates.push(channel as TextBasedChannel);
  }

  let collected = 0;
  let reused = 0;
  let errors = 0;
  let processed = 0;

  for (const channel of candidates) {
    if (processed >= limit) break;
    try {
      const result = await backfillFromChannel({
        channel,
        guild,
        userId,
        limit: limit - processed
      });
      collected += result.inserted;
      reused += result.reused;
      processed += result.processed;
    } catch (error) {
      errors += 1;
      log.warn({ scope: 'context-backfill', guildId: guild.id, channelId: channel.id, err: error }, 'failed to backfill channel');
    }
  }

  return { collected, reused, scannedChannels: candidates.length, errors };
}

async function backfillFromChannel(params: {
  channel: TextBasedChannel;
  guild: Guild;
  userId: string;
  limit: number;
}): Promise<{ processed: number; inserted: number; reused: number }> {
  const { channel, guild, userId, limit } = params;
  let processed = 0;
  let inserted = 0;
  let reused = 0;
  let before: string | undefined;

  while (processed < limit) {
    const fetchLimit = Math.min(FETCH_BATCH_SIZE, limit - processed);
    const batch = await channel.messages.fetch({ limit: fetchLimit, ...(before ? { before } : {}) });
    if (!batch.size) break;

    const sorted = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    before = sorted[0]?.id;

    for (const message of sorted) {
      if (message.author.id !== userId) continue;
      const clean = message.cleanContent?.trim();
      if (!clean) continue;
      if (isLikelyNoise(clean)) continue;

      const stored = ingestMessage(
        {
          guildId: guild.id,
          channelId: channel.id,
          userId,
          displayName: message.member?.displayName ?? message.author.username,
          content: message.cleanContent,
          timestamp: message.createdTimestamp,
          messageId: message.id
        },
        { skipProfileRefresh: true }
      );

      processed += 1;
      if (stored) {
        inserted += 1;
      } else {
        reused += 1;
      }

      if (processed >= limit) break;
    }

    if (batch.size < fetchLimit || !before || processed >= limit) {
      break;
    }
  }

  return { processed, inserted, reused };
}
