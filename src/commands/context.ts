import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { buildUserContextBlock } from '../context/builder.ts';
import { forceRefreshProfile } from '../context/ingest.ts';
import { config } from '../config.ts';
import { log } from '../logger.ts';
import { clampDiscordMessage } from '../util/text.ts';

export async function handleContextCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Somente em servidores.', flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('usuario') ?? interaction.user;
  const targetDisplayName = targetUser.username;

  if (subcommand === 'atualizar') {
    if (targetUser.id !== interaction.user.id && !canManageGuild(interaction)) {
      await interaction.reply({ content: 'Você não tem permissão para atualizar outros perfis.', flags: MessageFlags.Ephemeral });
      return;
    }

    forceRefreshProfile(interaction.guildId, targetUser.id, targetDisplayName);
    await interaction.reply({ content: `Contexto atualizado para ${targetDisplayName}.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === 'gerar') {
    if (targetUser.id !== interaction.user.id && !canManageGuild(interaction)) {
      await interaction.reply({
        content: 'Você não tem permissão para gerar contexto de outros usuários.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    forceRefreshProfile(interaction.guildId, targetUser.id, targetDisplayName);

    const compact = buildUserContextBlock(
      interaction.guildId,
      targetUser.id,
      config.contextCompactBudget
    );
    const extended = buildUserContextBlock(
      interaction.guildId,
      targetUser.id,
      config.contextExtendedBudget
    );

    log.info(
      {
        scope: 'context-generate',
        guildId: interaction.guildId,
        userId: targetUser.id,
        compactTokens: compact.tokensUsed,
        extendedTokens: extended.tokensUsed
      },
      'context regenerated via command'
    );

    await replyWithContextBundles(interaction, compact, extended, targetDisplayName);
    return;
  }

  if (subcommand === 'mostrar') {
    const budgetChoice = interaction.options.getString('budget') ?? 'compacto';
    const budget = budgetChoice === 'expandido' ? config.contextExtendedBudget : config.contextCompactBudget;
    const context = buildUserContextBlock(interaction.guildId, targetUser.id, budget);

    const header = `Contexto ${budgetChoice} (até ${budget} tokens). Usados: ${context.tokensUsed}.`;
    const body = context.text ?? 'Nenhum contexto salvo.';
    const message = clampDiscordMessage(`${header}\n\n${body}`);

    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    log.info({ scope: 'context-show', guildId: interaction.guildId, userId: targetUser.id, budget }, 'context shown');
    return;
  }

  await interaction.reply({ content: 'Subcomando desconhecido.', flags: MessageFlags.Ephemeral });
}

function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member;
  if (!member) return false;

  const permissions = (member as { permissions?: { has: (perm: bigint) => boolean } }).permissions;
  if (!permissions) return false;

  return permissions.has(PermissionFlagsBits.ManageGuild);
}

async function replyWithContextBundles(
  interaction: ChatInputCommandInteraction,
  compact: ReturnType<typeof buildUserContextBlock>,
  extended: ReturnType<typeof buildUserContextBlock>,
  displayName: string
) {
  const compactMessage = formatContextSection(
    `Contexto compacto (~${config.contextCompactBudget} tokens) para ${displayName}`,
    compact
  );
  const extendedMessage = formatContextSection(
    `Contexto expandido (~${config.contextExtendedBudget} tokens) para ${displayName}`,
    extended
  );

  const combined = `${compactMessage}\n\n${extendedMessage}`;
  if (combined.length <= 1900) {
    await interaction.reply({ content: clampDiscordMessage(combined), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ content: clampDiscordMessage(compactMessage), flags: MessageFlags.Ephemeral });
  await interaction.followUp({
    content: clampDiscordMessage(extendedMessage),
    flags: MessageFlags.Ephemeral
  });
}

function formatContextSection(title: string, block: ReturnType<typeof buildUserContextBlock>): string {
  const header = `${title} — tokens usados: ${block.tokensUsed}`;
  const body = block.text ?? 'Nenhum contexto armazenado.';
  return `${header}\n\n${body}`;
}
