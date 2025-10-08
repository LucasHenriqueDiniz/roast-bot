import { HeuristicSnapshot } from './heuristics.ts';

export type ProfileSummary = {
  summary: string;
  quirks: string[];
};

export function composeProfileSummary(
  heuristics: HeuristicSnapshot,
  opts: { displayName?: string }
): ProfileSummary {
  const { displayName } = opts;
  const { messageCount, obsessions, catchphrases, emojiRank, typoHighlights, laughPatterns, activeHours, personalClaims } =
    heuristics;

  const label = displayName ? `${displayName}` : 'Esse usuário';

  if (!messageCount) {
    const fallback = `${label} ainda não deixou nada digno de arquivo. Assim que surgir material, eu guardo.`;
    return {
      summary: fallback,
      quirks: ['Ainda estamos coletando munição.']
    };
  }

  const summaryParts: string[] = [];

  if (obsessions.length) {
    summaryParts.push(`${label} é obcecado por ${formatList(obsessions.slice(0, 3))}.`);
  }

  if (catchphrases.length) {
    summaryParts.push(`Fala como disco riscado, jogando ${formatQuotedList(catchphrases.slice(0, 3))} em qualquer assunto.`);
  }

  if (emojiRank.length) {
    summaryParts.push(`Assina tudo com ${formatList(emojiRank.slice(0, 3))}, como se emoji fosse pontuação.`);
  }

  if (activeHours.length) {
    summaryParts.push(`Aparece nos horários ${formatActiveWindow(activeHours)}, como vampiro sem CLT.`);
  }

  const summary = clampText(summaryParts.slice(0, 3).join(' '), 900);

  const quirks: string[] = [];

  for (const phrase of catchphrases.slice(0, 4)) {
    quirks.push(`Muleta verbal: "${phrase}"`);
  }

  for (const obsession of obsessions.slice(0, 4)) {
    quirks.push(`Obcecado por ${obsession}`);
  }

  if (emojiRank.length) {
    quirks.push(`Emoji de estimação: ${emojiRank.slice(0, 2).join(' ')}`);
  }

  if (typoHighlights.length) {
    quirks.push(`Digita ${formatList(typoHighlights.slice(0, 3))} como se estivesse possuído.`);
  }

  if (laughPatterns.length) {
    quirks.push(`Quando ri, solta ${formatList(laughPatterns.slice(0, 3))}.`);
  }

  for (const claim of personalClaims.slice(0, 2)) {
    quirks.push(`Admite: "${claim}"`);
  }

  if (!quirks.length) {
    quirks.push('Se acha perfeito, mas a gente sabe que não é.');
  }

  return { summary: summary || `${label} existe, mas ainda não entregou material divertido.`, quirks };
}

function formatList(list: string[]): string {
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

function formatQuotedList(list: string[]): string {
  return list.map((item) => `"${item}"`).join(', ');
}

function formatActiveWindow(hours: string[]): string {
  if (!hours.length) return '';
  if (hours.length === 1) return hours[0];
  return hours.slice(0, -1).join(', ') + ` e ${hours[hours.length - 1]}`;
}

function clampText(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1)}…`;
}
