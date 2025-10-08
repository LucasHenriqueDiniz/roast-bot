import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, TextBasedChannel } from 'discord.js';
import { config } from '../config.ts';
import {
  clearChannelPassiveInterval,
  getChannelPassiveInterval,
  setChannelPassiveInterval
} from '../db.ts';
import { triggerPassiveRoastForChannel } from '../listeners/messageCreate.ts';
import { log } from '../logger.ts';

export async function handlePassiveCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Somente em servidores.', flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'disparar') {
    if (!canManageGuild(interaction)) {
      await interaction.reply({
        content: 'Você precisa da permissão Manage Server para usar isso.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const channel = ensureTextChannel(interaction, 'canal');
    if (!channel) return;

    const user = interaction.options.getUser('usuario');
    const minContext = interaction.options.getInteger('contexto') ?? undefined;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await triggerPassiveRoastForChannel(interaction.guildId, channel, {
      targetUserId: user?.id,
      minContextMessages: minContext ?? config.passiveContextMessages,
      reason: 'manual-command'
    });

    if (result.sent) {
      await interaction.editReply(
        `Roast disparado para <@${result.targetUserId}> no canal <#${channel.id}>.`
      );
    } else {
      await interaction.editReply(`Não rolou roast: ${translateReason(result.reason)}.`);
    }
    return;
  }

  if (subcommand === 'intervalo') {
    if (!canManageGuild(interaction)) {
      await interaction.reply({
        content: 'Você precisa da permissão Manage Server para usar isso.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const channel = ensureTextChannel(interaction, 'canal');
    if (!channel) return;

    const reset = interaction.options.getBoolean('resetar') ?? false;
    const value = interaction.options.getInteger('valor') ?? config.passiveInterval;

    if (reset) {
      clearChannelPassiveInterval(interaction.guildId, channel.id);
      log.info(
        { guildId: interaction.guildId, channelId: channel.id },
        'reset passive interval override'
      );
      await interaction.reply({
        content: `Intervalo do canal <#${channel.id}> resetado para o padrão (${config.passiveInterval}).`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const clamped = Math.max(1, Math.min(value, 100));
    setChannelPassiveInterval(interaction.guildId, channel.id, clamped, Date.now());
    log.info(
      { guildId: interaction.guildId, channelId: channel.id, interval: clamped },
      'updated passive interval override'
    );

    await interaction.reply({
      content: `Intervalo do canal <#${channel.id}> definido para ${clamped} mensagens.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === 'status') {
    const channel = ensureTextChannel(interaction, 'canal');
    if (!channel) return;

    const override = getChannelPassiveInterval(interaction.guildId, channel.id);
    const effective = override?.interval ?? config.passiveInterval;
    const message = override
      ? `Canal <#${channel.id}> usa override de ${override.interval} mensagens (atualizado ${new Date(
          override.updatedAt
        ).toLocaleString()}).`
      : `Canal <#${channel.id}> usa o padrão global de ${config.passiveInterval} mensagens.`;

    await interaction.reply({
      content: `${message}\nValor efetivo: ${effective}.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({ content: 'Subcomando desconhecido.', flags: MessageFlags.Ephemeral });
}

function ensureTextChannel(
  interaction: ChatInputCommandInteraction,
  optionName: string
): TextBasedChannel | null {
  const option = interaction.options.getChannel(optionName);
  const channel = (option ?? interaction.channel) as TextBasedChannel | null;
  if (!channel || !channel.isTextBased()) {
    if (!interaction.deferred && !interaction.replied) {
      void interaction.reply({
        content: 'Selecione um canal de texto.',
        flags: MessageFlags.Ephemeral
      });
    }
    return null;
  }

  return channel;
}

function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member;
  if (!member) return false;

  const permissions = (member as { permissions?: { has: (perm: bigint) => boolean } }).permissions;
  if (!permissions) return false;

  return permissions.has(PermissionFlagsBits.ManageGuild);
}

function translateReason(reason: string): string {
  switch (reason) {
    case 'channel-not-text':
      return 'canal inválido';
    case 'no-target':
      return 'ninguém elegível no histórico';
    case 'busy':
      return 'já estou processando outro roast';
    case 'timeout':
      return 'modelo demorou demais';
    case 'empty-response':
      return 'modelo não respondeu nada';
    case 'llm-error':
      return 'erro na chamada do modelo';
    default:
      return reason;
  }
}
