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
    summaryParts.push(`${label} tem fixação doentia por ${formatList(obsessions.slice(0, 3))}.`);
  }

  if (catchphrases.length) {
    summaryParts.push(`Vive repetindo ${formatQuotedList(catchphrases.slice(0, 2))} como se fosse mantra.`);
  }

  if (personalClaims.length) {
    summaryParts.push(`Já admitiu sem pudor: ${formatQuotedList(personalClaims.slice(0, 1))}.`);
  }

  if (emojiRank.length) {
    summaryParts.push(`Assina cada drama com ${formatList(emojiRank.slice(0, 2))}.`);
  }

  if (activeHours.length) {
    summaryParts.push(`Surge no chat em horários de ${formatActiveWindow(activeHours)}, como se não existisse relógio biológico.`);
  }

  const summary = clampText(summaryParts.slice(0, 3).join(' '), 600);

  const quirks: string[] = [];

  for (const obsession of obsessions.slice(0, 4)) {
    quirks.push(`Obsessão recorrente: ${obsession}`);
  }

  for (const phrase of catchphrases.slice(0, 4)) {
    quirks.push(`Catchphrase eterna: "${phrase}"`);
  }

  if (emojiRank.length) {
    quirks.push(`Emoji de estimação: ${emojiRank.slice(0, 2).join(' ')}`);
  }

  if (typoHighlights.length) {
    quirks.push(`Digita ${formatList(typoHighlights.slice(0, 2))} achando que é idioma.`);
  }

  if (laughPatterns.length) {
    quirks.push(`Quando ri, sai ${formatList(laughPatterns.slice(0, 2))}.`);
  }

  for (const claim of personalClaims.slice(0, 2)) {
    quirks.push(`Confissão guardada: "${claim}"`);
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
  if (!list.length) return '';
  if (list.length === 1) return `"${list[0]}"`;
  return `${list
    .slice(0, -1)
    .map((item) => `"${item}"`)
    .join(', ')} e "${list[list.length - 1]}"`;
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
