import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getGuildSettings, setGuildPersonality } from '../db.ts';
import { log } from '../logger.ts';
import { getPersonalityDefinition, PERSONALITY_DEFINITIONS } from '../settings/personalities.ts';

export async function handlePersonalityCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Somente disponível em servidores.', flags: MessageFlags.Ephemeral });
    return;
  }

  const choice = interaction.options.getString('tipo');
  const currentSettings = getGuildSettings(interaction.guildId);

  if (!choice) {
    const current = getPersonalityDefinition(currentSettings.personality);
    await interaction.reply({
      content: `Personalidade atual do servidor: **${current.name}** — ${current.description}.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!canManageGuild(interaction)) {
    await interaction.reply({
      content: 'Somente quem tem Manage Server pode alterar a personalidade.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const definition = PERSONALITY_DEFINITIONS.find((item) => item.id === choice);
  if (!definition) {
    await interaction.reply({
      content: 'Personalidade inválida.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  setGuildPersonality(interaction.guildId, definition.id);
  log.info({ guildId: interaction.guildId, personality: definition.id }, 'guild personality updated');

  await interaction.reply({
    content: `Personalidade configurada para **${definition.name}**. ${definition.description}.`,
    flags: MessageFlags.Ephemeral
  });
}

function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as { permissions?: { has: (perm: bigint) => boolean } } | null;
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}
