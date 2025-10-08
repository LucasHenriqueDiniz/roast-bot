import { StoredMessage } from '../db.ts';
import {
  filterMeaningfulMessages,
  normalizeContent,
  redactSensitiveSegments,
  sanitizeToken
} from './filters.ts';

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
const PERSONAL_STATEMENT_REGEX = /(\b(eu|tô|to|sou|fui|vou|meu|minha|tenho|preciso|quero|acho|prometo|admito|i\s*am|i\s*feel|i\s*need|i\s*hate|i\s*love)\b)/i;

export type HeuristicSnapshot = {
  messageCount: number;
  obsessions: string[];
  catchphrases: string[];
  emojiRank: string[];
  typoHighlights: string[];
  laughPatterns: string[];
  activeHours: string[];
  personalClaims: string[];
};

export function extractHeuristics(messages: StoredMessage[]): HeuristicSnapshot {
  const considered = filterMeaningfulMessages(messages);

  if (!considered.length) {
    return {
      messageCount: 0,
      obsessions: [],
      catchphrases: [],
      emojiRank: [],
      typoHighlights: [],
      laughPatterns: [],
      activeHours: [],
      personalClaims: []
    };
  }

  const wordCounts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();
  const trigramCounts = new Map<string, number>();
  const emojiCounts = new Map<string, number>();
  const typoCounts = new Map<string, number>();
  const laughCounts = new Map<string, number>();
  const hourBuckets = new Map<number, number>();
  const personalClaims: string[] = [];

  for (const message of considered) {
    const rawContent = message.content ?? '';
    const redacted = redactSensitiveSegments(rawContent);
    const normalized = normalizeContent(redacted);
    if (!normalized) continue;

    const emojis = normalized.match(EMOJI_REGEX);
    if (emojis) {
      for (const emoji of emojis) {
        emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1);
      }
    }

    const tokens = tokenize(normalized);
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

    if (PERSONAL_STATEMENT_REGEX.test(normalized)) {
      const claim = truncateSentence(normalized, 160);
      if (claim && !personalClaims.includes(claim)) {
        personalClaims.push(claim);
      }
    }

    const hour = new Date(message.ts).getUTCHours();
    hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + 1);
  }

  const messageCount = considered.length;

  return {
    messageCount,
    obsessions: pickTopWithMin(wordCounts, 20, 2).filter((word) => word.length > 3).slice(0, 8),
    catchphrases: prettifyCatchphrases(
      dedupe([...pickTopWithMin(bigramCounts, 10, 2), ...pickTopWithMin(trigramCounts, 8, 2)])
    ),
    emojiRank: pickTopWithMin(emojiCounts, 6, 2),
    typoHighlights: pickTopWithMin(typoCounts, 6, 2),
    laughPatterns: pickTopWithMin(laughCounts, 5, 2),
    activeHours: formatActiveHours(hourBuckets),
    personalClaims: personalClaims.slice(0, 6)
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

function pickTopWithMin(map: Map<string, number>, limit: number, minimum: number): string[] {
  return [...map.entries()]
    .filter(([, count]) => count >= minimum)
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
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => `${hour.toString().padStart(2, '0')}h`);
}

function truncateSentence(input: string, maxLength: number): string | null {
  if (!input) return null;
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1)}…`;
}

function prettifyCatchphrases(phrases: string[]): string[] {
  return phrases
    .map((phrase) => {
      const parts = phrase.split(' ');
      if (parts.length <= 1) return phrase;
      if (parts.every((part) => part === parts[0])) {
        return `${parts[0]}`;
      }
      return phrase;
    })
    .filter((phrase, idx, arr) => phrase && arr.indexOf(phrase) === idx);
}
