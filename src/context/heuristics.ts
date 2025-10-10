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

const PHRASE_REWRITES: [RegExp, string][] = [
  [/dockercompose/g, 'docker compose'],
  [/ensino medio/g, 'ensino médio'],
  [/varwwwhtml/g, 'var/www/html'],
  [/mongodb/g, 'mongo db'],
  [/postgress?/g, 'postgres'],
  [/fullstack/g, 'full stack'],
  [/frontend/g, 'front-end'],
  [/backend/g, 'back-end'],
  [/apiendpoint/g, 'api endpoint'],
  [/discordserver/g, 'discord server']
];

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
    obsessions: deriveTopics(wordCounts, bigramCounts, trigramCounts),
    catchphrases: deriveCatchphrases(bigramCounts, trigramCounts),
    emojiRank: pickTopWithMin(emojiCounts, 6, 2),
    typoHighlights: pickTopWithMin(typoCounts, 6, 2),
    laughPatterns: pickTopWithMin(laughCounts, 5, 2),
    activeHours: formatActiveHours(hourBuckets),
    personalClaims: personalClaims
      .map((claim) => cleanPhrase(claim))
      .filter((claim): claim is string => Boolean(claim))
      .slice(0, 6)
      .map((claim) => clampSentence(claim))
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
  const cleaned = phrases
    .map((phrase) => cleanPhrase(phrase))
    .filter((phrase): phrase is string => Boolean(phrase));

  const deduped = cleaned.filter((phrase, idx) => cleaned.indexOf(phrase) === idx);

  return deduped.slice(0, 6);
}

function deriveTopics(
  words: Map<string, number>,
  bigrams: Map<string, number>,
  trigrams: Map<string, number>
): string[] {
  const scores = new Map<string, number>();

  for (const [ngram, count] of bigrams.entries()) {
    if (count < 2) continue;
    const cleaned = cleanPhrase(ngram);
    if (!cleaned) continue;
    scores.set(cleaned, Math.max(scores.get(cleaned) ?? 0, count * 2));
  }

  for (const [ngram, count] of trigrams.entries()) {
    if (count < 2) continue;
    const cleaned = cleanPhrase(ngram);
    if (!cleaned) continue;
    scores.set(cleaned, Math.max(scores.get(cleaned) ?? 0, count * 2.5));
  }

  for (const [word, count] of words.entries()) {
    if (count < 3) continue;
    const cleaned = cleanWord(word);
    if (!cleaned) continue;
    if (scores.has(cleaned)) {
      scores.set(cleaned, (scores.get(cleaned) ?? 0) + count * 0.5);
    } else {
      scores.set(cleaned, count);
    }
  }

  const sorted = [...scores.entries()]
    .filter(([topic]) => topic.split(' ').length <= 4)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);

  return dedupe(sorted).slice(0, 6);
}

function deriveCatchphrases(bigrams: Map<string, number>, trigrams: Map<string, number>): string[] {
  const scores = new Map<string, number>();

  for (const [phrase, count] of bigrams.entries()) {
    if (count < 2) continue;
    const cleaned = cleanPhrase(phrase);
    if (!cleaned || cleaned.length < 6) continue;
    scores.set(cleaned, Math.max(scores.get(cleaned) ?? 0, count * 1.5));
  }

  for (const [phrase, count] of trigrams.entries()) {
    if (count < 2) continue;
    const cleaned = cleanPhrase(phrase);
    if (!cleaned || cleaned.length < 6) continue;
    scores.set(cleaned, Math.max(scores.get(cleaned) ?? 0, count * 1.8));
  }

  return dedupe(
    [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([phrase]) => clampSentence(phrase))
  ).slice(0, 8);
}

function cleanWord(word: string): string | null {
  const normalized = cleanPhrase(word);
  if (!normalized) return null;
  if (normalized.length > 16) return null;
  if (!/[aeiouáéíóúâêôãõ]/i.test(normalized)) return null;
  return normalized;
}

function cleanPhrase(phrase: string): string | null {
  if (!phrase) return null;
  const normalized = phrase
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  let refined = normalized;

  for (const [pattern, replacement] of PHRASE_REWRITES) {
    refined = refined.replace(pattern, replacement);
  }

  refined = refined.replace(/\s{2,}/g, ' ').trim();

  if (!/[aeiouáéíóúâêôãõ]/i.test(refined)) return null;
  if (refined.length < 3) return null;
  if (refined.length > 60) return null;

  const words = refined.split(' ');
  if (words.length > 1 && words.every((piece) => piece === words[0])) {
    return words[0];
  }
  if (words.every((piece) => STOP_WORDS.has(piece))) return null;
  if (words.some((piece) => piece.length > 18)) return null;

  return refined;
}

function clampSentence(sentence: string, limit = 160): string {
  if (sentence.length <= limit) return sentence;
  return `${sentence.slice(0, limit - 1)}…`;
}
