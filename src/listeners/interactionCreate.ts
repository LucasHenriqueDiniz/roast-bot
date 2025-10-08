import { Interaction, MessageFlags } from 'discord.js';
import { commandHandlers } from '../commands/index.ts';
import { config } from '../config.ts';
import { log } from '../logger.ts';

export async function onInteractionCreate(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (config.allowedGuildId && interaction.guildId !== config.allowedGuildId) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: 'Servidor não autorizado.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }

  const handler = commandHandlers[interaction.commandName];
  if (!handler) {
    return;
  }

  try {
    await handler(interaction);
  } catch (error) {
    log.error({ err: error, command: interaction.commandName }, 'command handler failed');
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Erro. Veja os logs.').catch(() => {});
      } else {
        await interaction.reply({ content: 'Erro. Veja os logs.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }
}
