import { ChatInputCommandInteraction, Message, MessageFlags, TextBasedChannel } from 'discord.js';
import { config } from '../config.ts';
import { buildRoastPrompt, RecentMessage } from '../context/builder.ts';
import { chat } from '../llm.ts';
import { log } from '../logger.ts';
import { sanitizeForPrompt } from '../util/text.ts';

export async function handleRoastMe(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Apenas servidores.', flags: MessageFlags.Ephemeral });
    return;
  }

  const intensidade = (interaction.options.getInteger('intensidade') ?? 1) as 0 | 1 | 2;
  const contexto = Math.min(Math.max(interaction.options.getInteger('contexto') ?? 6, 0), 15);

  await interaction.deferReply();

  const recentMessages = await collectRecentMessages(interaction, contexto);

  const prompt = buildRoastPrompt({
    guildId: interaction.guildId,
    requesterId: interaction.user.id,
    requesterDisplayName: resolveDisplayName(interaction),
    intensity: intensidade,
    recentMessages,
    budgetTokens: contexto >= 8 ? config.contextExtendedBudget : config.contextCompactBudget
  });

  try {
    const reply = await chat(
      [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ],
      { temperature: 0.9 }
    );

    const message = reply || 'Sem material ainda. Tenta de novo depois.';
    await interaction.editReply(message);
  } catch (error) {
    log.error({ err: error }, 'failed to roast user');
    await interaction.editReply('Erro chamando o modelo.');
  }
}

async function collectRecentMessages(
  interaction: ChatInputCommandInteraction,
  contexto: number
): Promise<RecentMessage[]> {
  if (contexto <= 0) return [];
  const channel = interaction.channel;
  if (!channel || !isFetchableChannel(channel)) return [];

  const fetched = await channel.messages.fetch({ limit: Math.min(contexto + 5, 20) });
  const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  return sorted.map(mapToRecentMessage).filter(Boolean) as RecentMessage[];
}

function isFetchableChannel(channel: TextBasedChannel): channel is TextBasedChannel & {
  messages: TextBasedChannel['messages'] & { fetch: TextBasedChannel['messages']['fetch'] };
} {
  return typeof channel.messages?.fetch === 'function';
}

function mapToRecentMessage(message: Message): RecentMessage | null {
  if (!message.cleanContent?.trim()) return null;
  return {
    authorName: message.member?.displayName ?? message.author.username,
    userId: message.author.id,
    content: sanitizeForPrompt(message.cleanContent)
  };
}

function resolveDisplayName(interaction: ChatInputCommandInteraction): string {
  const member = interaction.member;
  if (member && typeof (member as { nickname?: string }).nickname === 'string') {
    return (member as { nickname?: string }).nickname ?? interaction.user.username;
  }

  if (member && typeof (member as { displayName?: string }).displayName === 'string') {
    return (member as { displayName?: string }).displayName ?? interaction.user.username;
  }

  return interaction.user.username;
}
