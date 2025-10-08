import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { buildUserContextBlock } from '../context/builder.ts';
import { forceRefreshProfile } from '../context/ingest.ts';
import { log } from '../logger.ts';
import { clampDiscordMessage } from '../util/text.ts';

const UPDATE_CONTEXT_BUDGET = 3000;

export async function handleUpdateContextCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
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

  forceRefreshProfile(interaction.guildId, target.id, target.username);
  const block = buildUserContextBlock(interaction.guildId, target.id, UPDATE_CONTEXT_BUDGET);

  log.info(
    {
      scope: 'update-context-command',
      guildId: interaction.guildId,
      targetUserId: target.id,
      tokensUsed: block.tokensUsed
    },
    'manual context refresh'
  );

  const header = `Contexto regenerado para ${target.username} (até ${UPDATE_CONTEXT_BUDGET} tokens).`;
  const body = block.text ?? 'Nenhum dado salvo ainda.';
  const message = clampDiscordMessage(`${header}\n\n${body}`);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(message);
  } else {
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }
}

function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as { permissions?: { has: (perm: bigint) => boolean } } | null;
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}
