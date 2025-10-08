import { StoredMessage } from '../db.ts';
import { filterMeaningfulMessages, sanitizeToken } from './filters.ts';

const STOP_WORDS = new Set([
  'a',
  'as',
  'o',
  'os',
  'um',
  'uma',
  'de',
  'da',
  'do',
  'e',
  'é',
  'em',
  'que',
  'pra',
  'para',
  'the',
  'and',
  'you',
  'me',
  'i',
  'eu',
  'ele',
  'ela',
  'no',
  'na',
  'nos',
  'nas',
  'se',
  'ser',
  'tem',
  'tá',
  'ta',
  'isso',
  'http',
  'https',
  'www',
  'com',
  'discord',
  'jpg',
  'png',
  'pdf'
]);

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

export type HeuristicSnapshot = {
  totalMessages: number;
  averageLength: number;
  topWords: string[];
  catchphrases: string[];
  topics: string[];
  emojiRank: string[];
  typoHighlights: string[];
  laughPatterns: string[];
  activeHours: string[];
};

export function extractHeuristics(messages: StoredMessage[]): HeuristicSnapshot {
  const considered = filterMeaningfulMessages(messages);

  if (!considered.length) {
    return {
      totalMessages: 0,
      averageLength: 0,
      topWords: [],
      catchphrases: [],
      topics: [],
      emojiRank: [],
      typoHighlights: [],
      laughPatterns: [],
      activeHours: []
    };
  }

  const wordCounts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();
  const trigramCounts = new Map<string, number>();
  const emojiCounts = new Map<string, number>();
  const typoCounts = new Map<string, number>();
  const laughCounts = new Map<string, number>();
  const hourBuckets = new Map<number, number>();

  let totalLength = 0;

  for (const message of considered) {
    const content = message.content ?? '';
    totalLength += content.length;

    const emojis = content.match(EMOJI_REGEX);
    if (emojis) {
      for (const emoji of emojis) {
        emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1);
      }
    }

    const tokens = tokenize(content);
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1);

      if (i < tokens.length - 1) {
        const bigram = `${token} ${tokens[i + 1]}`;
        bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
      }

      if (i < tokens.length - 2) {
        const trigram = `${token} ${tokens[i + 1]} ${tokens[i + 2]}`;
        trigramCounts.set(trigram, (trigramCounts.get(trigram) ?? 0) + 1);
      }

      if (isLaugh(token)) {
        laughCounts.set(token, (laughCounts.get(token) ?? 0) + 1);
      }

      if (looksLikeTypo(token)) {
        typoCounts.set(token, (typoCounts.get(token) ?? 0) + 1);
      }
    }

    const hour = new Date(message.ts).getUTCHours();
    hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + 1);
  }

  const totalMessages = considered.length;
  const averageLength = totalMessages ? totalLength / totalMessages : 0;

  return {
    totalMessages,
    averageLength,
    topWords: pickTop(wordCounts, 10),
    catchphrases: dedupe([...pickTop(bigramCounts, 6), ...pickTop(trigramCounts, 4)]),
    topics: pickTop(wordCounts, 15).filter((word) => word.length > 3).slice(0, 8),
    emojiRank: pickTop(emojiCounts, 8),
    typoHighlights: pickTop(typoCounts, 5),
    laughPatterns: pickTop(laughCounts, 5),
    activeHours: formatActiveHours(hourBuckets)
  };
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/www\.\S+/g, ' ')
    .split(/\s+/)
    .map((token) => sanitizeToken(token ?? ''))
    .filter((token): token is string => Boolean(token && token.length > 1 && !STOP_WORDS.has(token)));
}

function pickTop(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function isLaugh(token: string): boolean {
  return /^(ha|he|hi|ho|hu|kkk|rs)+[ahiekou]*$/i.test(token);
}

function looksLikeTypo(token: string): boolean {
  if (token.length < 4) return false;
  if (/\d/.test(token)) return false;
  return /(.)\1{2,}/.test(token);
}

function formatActiveHours(buckets: Map<number, number>): string[] {
  if (!buckets.size) return [];
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return sorted.map(([hour, count]) => `${hour.toString().padStart(2, '0')}h UTC (${count} msgs)`);
}
