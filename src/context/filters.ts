const LETTER_REGEX = /\p{L}/gu;
const URL_REGEX = /(https?:\/\/|www\.)/i;
const INVITE_REGEX = /discord\.(gg|com\/invite)/i;
const CODE_BLOCK_REGEX = /```/;
const QUOTE_REGEX = /^>+/m;

const PERSONAL_TOKENS = new Set([
  'eu',
  'tu',
  'voce',
  'você',
  'vc',
  'cê',
  'ce',
  'meu',
  'minha',
  'meus',
  'minhas',
  'teu',
  'tua',
  'seu',
  'sua',
  'seus',
  'suas',
  'nos',
  'nós',
  'nosso',
  'nossa',
  'nossos',
  'nossas',
  'eles',
  'elas',
  'dele',
  'dela',
  'deles',
  'delas',
  'gente',
  'galera',
  'mano',
  'man',
  'cara',
  'bro',
  'dude',
  'amigo',
  'amiga',
  'sou',
  'estou',
  'tô',
  'to',
  'tava',
  'fui',
  'vou',
  'vamos',
  'tenho',
  'quero',
  'preciso',
  'acho',
  'penso',
  'falo',
  'digo',
  'prefiro',
  'gosto',
  'amo',
  'odeio',
  'sinto',
  'porra',
  'puta',
  'merda',
  'kk',
  'kkkk',
  'rs',
  'lol',
  'lmao',
  'wtf',
  'pq',
  'porque',
  'cadê',
  'cade',
  'vcs',
  'vocês',
  'you',
  'your',
  'youre',
  "you're",
  'u',
  'ur',
  'ya',
  'yall',
  'i',
  "i'm",
  'im',
  'me',
  'my',
  'mine',
  'myself',
  'we',
  'us',
  'our',
  'ours',
  'they',
  'them',
  'their',
  'theirs',
  'brother',
  'sister',
  'idiot',
  'noob',
  'nerd',
  'geek',
  'doido',
  'maluco'
]);

export function normalizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

export function isLikelyNoise(content: string): boolean {
  const normalized = normalizeContent(content);
  if (!normalized) return true;
  if (normalized.length < 12) return true;
  if (URL_REGEX.test(normalized) || INVITE_REGEX.test(normalized)) return true;
  if (CODE_BLOCK_REGEX.test(normalized)) return true;
  if (QUOTE_REGEX.test(normalized)) return true;

  const compact = normalized.replace(/\s+/g, '');
  if (!compact) return true;

  const letters = compact.match(LETTER_REGEX)?.length ?? 0;
  if (letters < 12) return true;

  const ratio = letters / compact.length;
  if (ratio < 0.5) return true;

  return false;
}

export function prepareSnippetContent(content: string): string | null {
  const normalized = normalizeContent(content);
  if (!normalized) return null;
  if (normalized.length < 40 || normalized.length > 280) return null;
  if (URL_REGEX.test(normalized) || INVITE_REGEX.test(normalized)) return null;
  if (CODE_BLOCK_REGEX.test(normalized)) return null;

  const compact = normalized.replace(/\s+/g, '');
  if (!compact) return null;

  const letters = compact.match(LETTER_REGEX)?.length ?? 0;
  if (letters < 40) return null;

  const ratio = letters / compact.length;
  if (ratio < 0.6) return null;

  const lowerTokens = normalized
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);

  const hasPersonalAnchor = lowerTokens.some((token) => PERSONAL_TOKENS.has(token));
  if (!hasPersonalAnchor) return null;

  return normalized;
}

export function filterMeaningfulMessages<T extends { content: string }>(messages: T[]): T[] {
  return messages.filter((message) => !isLikelyNoise(message.content));
}

export function sanitizeToken(token: string): string | null {
  const cleaned = token.replace(/[^\p{L}]/gu, '').trim();
  if (!cleaned) return null;
  return cleaned;
}
