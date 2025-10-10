import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.ts';
import { buildUserContextBlock } from '../context/builder.ts';
import { backfillUserMessages } from '../context/history.ts';
import { forceRefreshProfile } from '../context/ingest.ts';
import { getUserProfile } from '../db.ts';
import { log } from '../logger.ts';
import { clampDiscordMessage } from '../util/text.ts';

const UPDATE_CONTEXT_BUDGET = 3000;

export async function handleUpdateContextCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: 'Somente em servidores.', flags: MessageFlags.Ephemeral });
    return;
  }

  const target = interaction.options.getUser('usuario') ?? interaction.user;
  const isSelf = target.id === interaction.user.id;

  if (!isSelf && !canManageGuild(interaction)) {
    await interaction.reply({
      content: 'Você não pode atualizar o contexto de outras pessoas.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const backfill = await backfillUserMessages(interaction.guild, target.id, {
    limit: config.profileRecentMessageLimit
  });

  const refreshResult = forceRefreshProfile(interaction.guildId, target.id, target.username);
  const block = buildUserContextBlock(interaction.guildId, target.id, UPDATE_CONTEXT_BUDGET);
  const profile = getUserProfile(interaction.guildId, target.id);

  log.info(
    {
      scope: 'update-context-command',
      guildId: interaction.guildId,
      targetUserId: target.id,
      tokensUsed: block.tokensUsed,
      backfilledMessages: backfill.collected,
      reusedMessages: backfill.reused,
      backfillErrors: backfill.errors,
      channelsScanned: backfill.scannedChannels,
      profileCreated: Boolean(profile),
      profileUpdated: refreshResult?.updated ?? false
    },
    'manual context refresh'
  );

  const header = `Contexto regenerado para ${target.username} (até ${UPDATE_CONTEXT_BUDGET} tokens).`;
  const body = block.text ?? 'Nenhum dado salvo ainda.';
  const summaryLines = [
    header,
    `Mensagens novas: ${backfill.collected} | já armazenadas: ${backfill.reused} | canais varridos: ${backfill.scannedChannels}` +
      (backfill.errors ? ` | falhas: ${backfill.errors}` : ''),
    `Perfil ${profile ? 'disponível' : 'indisponível'} — ${refreshResult?.updated ? 'atualizado agora' : 'sem mudanças recentes'}.`,
    '',
    body
  ];

  const message = clampDiscordMessage(summaryLines.join('\n'));

  await interaction.editReply({ content: message });
}

function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as { permissions?: { has: (perm: bigint) => boolean } } | null;
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}
