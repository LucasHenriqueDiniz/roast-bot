export function sanitizeForPrompt(content: string | null | undefined, maxLength = 280): string {
  if (!content) return '';
  return content.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function clampDiscordMessage(content: string, maxLength = 1900): string {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength - 1)}…`;
}
