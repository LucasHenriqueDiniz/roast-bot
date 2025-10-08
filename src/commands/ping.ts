import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

export async function handlePing(interaction: ChatInputCommandInteraction) {
  await interaction.reply({ content: 'Pong!', flags: MessageFlags.Ephemeral });
}
