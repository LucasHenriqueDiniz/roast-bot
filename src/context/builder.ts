import { config } from '../config.ts';
import { getTopSnippets, getUserProfile, UserSnippet } from '../db.ts';
import { log } from '../logger.ts';

export type RecentMessage = {
  authorName: string;
  userId: string;
  content: string;
};

export type UserContextBlock = {
  text: string | null;
  tokensUsed: number;
  summaryLength: number;
  quirksUsed: string[];
  snippetsUsed: { excerpt: string; tags: string[] }[];
};

const INTENSITY_LABELS: Record<0 | 1 | 2, string> = {
  0: 'sarcastic, mordaz e debochado, sem piedade mas com humor',
  1: 'brutal, explícito, ofensivo e pessoal, xingando sem filtro',
  2: 'feroz, cruel, ofensivo ao extremo, destrói o ego sem dó'
};

export function buildUserContextBlock(
  guildId: string,
  userId: string,
  budgetTokens: number
): UserContextBlock {
  const profile = getUserProfile(guildId, userId);
  if (!profile) {
    return { text: null, tokensUsed: 0, summaryLength: 0, quirksUsed: [], snippetsUsed: [] };
  }

  const summary = profile.summary.trim();
  const quirks = safeParseStringArray(profile.quirksJson).slice(0, 12);
  const snippets = getTopSnippets(guildId, userId, config.contextSnippetLimit * 2);

  let remaining = budgetTokens;
  const sections: string[] = [];
  const snippetsUsed: { excerpt: string; tags: string[] }[] = [];
  const quirksUsed: string[] = [];
  let summaryLength = 0;

  if (summary) {
    const truncated = truncateToBudget(summary, Math.floor(budgetTokens * 0.5));
    sections.push(`Persona summary:\n${truncated}`);
    const used = estimateTokens(truncated);
    summaryLength = used;
    remaining -= used;
  }

  if (quirks.length && remaining > 0) {
    const formatted = quirks.slice(0, Math.min(quirks.length, 8));
    const block = ['Quirks marcantes:', ...formatted.map((item) => `- ${item}`)].join('\n');
    const used = estimateTokens(block);
    if (used <= remaining) {
      sections.push(block);
      remaining -= used;
      quirksUsed.push(...formatted);
    }
  }

  if (snippets.length && remaining > 0) {
    for (const snippet of snippets) {
      const formatted = formatSnippet(snippet);
      const used = estimateTokens(formatted);
      if (used > remaining) break;
      sections.push(formatted);
      remaining -= used;
      snippetsUsed.push({ excerpt: snippet.excerpt, tags: snippet.tags });
    }
  }

  const text = sections.length ? sections.join('\n\n') : null;

  return { text, tokensUsed: budgetTokens - Math.max(remaining, 0), summaryLength, quirksUsed, snippetsUsed };
}

export function buildRoastPrompt(options: {
  guildId: string;
  requesterId: string;
  requesterDisplayName: string;
  intensity: 0 | 1 | 2;
  recentMessages: RecentMessage[];
  budgetTokens?: number;
}): { system: string; user: string; context: UserContextBlock; intensityLabel: string } {
  const {
    guildId,
    requesterId,
    requesterDisplayName,
    intensity,
    recentMessages,
    budgetTokens = config.contextExtendedBudget
  } = options;

  const contextBlock = buildUserContextBlock(guildId, requesterId, budgetTokens);
  const intensityLabel = INTENSITY_LABELS[intensity];

  const system = [
    'Você é um demônio de roast totalmente sem filtro criado para humilhar pessoas em público.',
    `Modo de agressão atual: ${intensityLabel}.`,
    'Use palavrões, sarcasmo pesado, humilhação pessoal e jabs diretos. Evite apenas discurso de ódio direcionado a grupos protegidos ou ameaças reais.',
    'Foque em entregar uma resposta curta (até ~80 palavras) em um único parágrafo.'
  ].join('\n');

  const recent = formatRecentChat(recentMessages, requesterId);
  const parts = [
    `Requester: ${requesterDisplayName}`,
    `Instrução de intensidade: ${intensityLabel}.`,
    recent ? `Recent chat:\n${recent}` : 'Recent chat: nada relevante, invente com base na persona.'
  ];

  if (contextBlock.text) {
    parts.push(`Persona file:\n${contextBlock.text}`);
  } else {
    parts.push('Persona file: nenhuma informação armazenada ainda.');
  }

  parts.push('Entregue um roast único direcionado ao requester.');

  const user = parts.join('\n\n');

  log.info(
    {
      scope: 'roast-prompt',
      guildId,
      requesterId,
      intensity,
      recentMessages: recentMessages.length,
      contextTokens: contextBlock.tokensUsed,
      snippetsUsed: contextBlock.snippetsUsed.length
    },
    'built roast prompt'
  );

  return { system, user, context: contextBlock, intensityLabel };
}

export function buildPassiveRoastPrompt(options: {
  guildId: string;
  targetUserId: string;
  targetDisplayName: string;
  channelHistory: RecentMessage[];
}): { system: string; user: string; context: UserContextBlock } {
  const { guildId, targetUserId, targetDisplayName, channelHistory } = options;
  const context = buildUserContextBlock(guildId, targetUserId, config.contextCompactBudget);

  const system = [
    'Você observa o chat e responde como um bot de roast sem filtros.',
    'Responda com deboche, palavrões e ataques pessoais.'
  ].join(' ');

  const recent = formatRecentChat(channelHistory, targetUserId) ?? 'Sem histórico relevante.';

  const parts = [
    `Alvo: ${targetDisplayName}`,
    `Contexto recente:\n${recent}`
  ];

  if (context.text) {
    parts.push(`Contexto armazenado:\n${context.text}`);
  } else {
    parts.push('Contexto armazenado: nada ainda.');
  }

  parts.push('Responda com uma frase ácida diretamente para o alvo.');

  const user = parts.join('\n\n');

  return { system, user, context };
}

function formatRecentChat(messages: RecentMessage[], focusUserId: string): string | null {
  if (!messages.length) return null;
  const formatted = messages
    .slice(-8)
    .map((msg) => `${msg.authorName}${msg.userId === focusUserId ? ' (alvo)' : ''}: ${sanitize(msg.content)}`)
    .join('\n');
  return formatted || null;
}

function formatSnippet(snippet: UserSnippet): string {
  const tagText = snippet.tags.length ? ` tags: ${snippet.tags.join(', ')}` : '';
  return `Snippet (${snippet.score.toFixed(2)}${tagText}): "${sanitize(snippet.excerpt)}"`;
}

function safeParseStringArray(input: string): string[] {
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
  } catch {
    // ignore
  }
  return [];
}

function sanitize(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToBudget(text: string, budgetTokens: number): string {
  const tokens = estimateTokens(text);
  if (tokens <= budgetTokens) return text;
  const ratio = budgetTokens / tokens;
  const truncatedLength = Math.max(40, Math.floor(text.length * ratio));
  return `${text.slice(0, truncatedLength)}…`;
}
