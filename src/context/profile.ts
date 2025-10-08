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
  const { totalMessages, averageLength, topWords, catchphrases, topics, emojiRank, typoHighlights, laughPatterns, activeHours } =
    heuristics;

  const sentences: string[] = [];

  const label = displayName ? `${displayName}` : 'Esse usuário';

  if (!totalMessages) {
    sentences.push(`${label} ainda não deixou nada digno de arquivo. Assim que surgir material, eu guardo.`);
    return {
      summary: sentences.join(' '),
      quirks: ['Ainda estamos coletando munição.']
    };
  }

  sentences.push(
    `${label} deixou ${totalMessages} mensagens recentes com média de ${Math.round(averageLength)} caracteres, sempre pingando no chat com a sutileza de um caminhão sem freio.`
  );

  if (topics.length) {
    sentences.push(`Os assuntos que mais aparecem: ${formatList(topics.slice(0, 5))}.`);
  }

  if (topWords.length) {
    sentences.push(`Palavras favoritas: ${formatList(topWords.slice(0, 6))}.`);
  }

  if (emojiRank.length) {
    sentences.push(`Emojis de estimação: ${formatList(emojiRank.slice(0, 5))}.`);
  }

  if (activeHours.length) {
    sentences.push(`Atividade crônica em ${formatList(activeHours)}.`);
  }

  const quirks: string[] = [];

  if (catchphrases.length) {
    quirks.push(`Repete até cansar: ${formatQuotedList(catchphrases.slice(0, 4))}`);
  }

  if (laughPatterns.length) {
    quirks.push(`Risada característica: ${formatList(laughPatterns)}`);
  }

  if (typoHighlights.length) {
    quirks.push(`Erros clássicos: ${formatList(typoHighlights)}`);
  }

  if (!quirks.length) {
    quirks.push('Se acha perfeito, mas a gente sabe que não é.');
  }

  const summary = clampText(sentences.join(' '), 1800);

  return { summary, quirks };
}

function formatList(list: string[]): string {
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

function formatQuotedList(list: string[]): string {
  return list.map((item) => `"${item}"`).join(', ');
}

function clampText(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1)}…`;
}
