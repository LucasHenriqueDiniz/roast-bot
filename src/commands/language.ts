import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getGuildSettings, setGuildLanguage } from '../db.ts';
import { log } from '../logger.ts';
import { getLanguageDefinition, LANGUAGE_DEFINITIONS } from '../settings/languages.ts';

export async function handleLanguageCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Somente disponível em servidores.', flags: MessageFlags.Ephemeral });
    return;
  }

  const choice = interaction.options.getString('idioma');
  const currentSettings = getGuildSettings(interaction.guildId);

  if (!choice) {
    const current = getLanguageDefinition(currentSettings.language);
    await interaction.reply({
      content: `Idioma atual do servidor: **${current.name}**.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!canManageGuild(interaction)) {
    await interaction.reply({
      content: 'Somente quem tem Manage Server pode alterar o idioma.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const definition = LANGUAGE_DEFINITIONS.find((item) => item.code === choice);
  if (!definition) {
    await interaction.reply({ content: 'Idioma inválido.', flags: MessageFlags.Ephemeral });
    return;
  }

  setGuildLanguage(interaction.guildId, definition.code);
  log.info({ guildId: interaction.guildId, language: definition.code }, 'guild language updated');

  await interaction.reply({
    content: `Idioma configurado para **${definition.name}**.`,
    flags: MessageFlags.Ephemeral
  });
}

function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as { permissions?: { has: (perm: bigint) => boolean } } | null;
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}
