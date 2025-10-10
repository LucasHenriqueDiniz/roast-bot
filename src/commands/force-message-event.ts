import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, TextBasedChannel } from 'discord.js';
import { triggerPassiveRoastForChannel } from '../listeners/messageCreate.ts';

export async function handleForceMessageEventCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Somente em servidores.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!canManageGuild(interaction)) {
    await interaction.reply({
      content: 'Somente quem tem Manage Server pode disparar o modo passivo manualmente.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const channelOption = interaction.options.getChannel('canal');
  const channel = (channelOption ?? interaction.channel) as (TextBasedChannel & {
    send?: (...args: unknown[]) => unknown;
  }) | null;

  if (!channel || typeof channel.send !== 'function') {
    await interaction.reply({ content: 'Escolha um canal de texto válido.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetUser = interaction.options.getUser('usuario');
  const minContext = interaction.options.getInteger('contexto') ?? undefined;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await triggerPassiveRoastForChannel(interaction.guildId, channel, {
    targetUserId: targetUser?.id,
    reason: 'manual-command',
    minContextMessages: minContext ?? undefined
  });

  if (result.sent) {
    await interaction.editReply(`Roast passivo enviado para <@${result.targetUserId}> no canal ${channel}.`);
    return;
  }

  await interaction.editReply(`Nenhum roast enviado. Motivo: ${result.reason}.`);
}

function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as { permissions?: { has: (perm: bigint) => boolean } } | null;
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}
