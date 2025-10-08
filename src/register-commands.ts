import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from './config.ts';

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

const discordToken = requireEnv(config.discordToken, 'DISCORD_TOKEN');
const discordAppId = requireEnv(config.discordAppId, 'DISCORD_APP_ID');
const allowedGuildId = requireEnv(config.allowedGuildId, 'ALLOWED_GUILD_ID');

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Pong!').toJSON(),
  new SlashCommandBuilder()
    .setName('roastme')
    .setDescription('Receba um roast (opt-in).')
    .addIntegerOption((o) =>
      o.setName('intensidade').setDescription('0=leve, 1=moderado, 2=picante').setMinValue(0).setMaxValue(2)
    )
    .addIntegerOption((o) =>
      o.setName('contexto').setDescription('Mensagens recentes para contexto (0–15)').setMinValue(0).setMaxValue(15)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('contexto')
    .setDescription('Gerencia o contexto individual dos roasts')
    .addSubcommand((sub) =>
      sub
        .setName('atualizar')
        .setDescription('Força a reconstrução do contexto do usuário alvo')
        .addUserOption((opt) => opt.setName('usuario').setDescription('Usuário alvo'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('mostrar')
        .setDescription('Mostra o contexto salvo para inspeção')
        .addUserOption((opt) => opt.setName('usuario').setDescription('Usuário alvo'))
        .addStringOption((opt) =>
          opt
            .setName('budget')
            .setDescription('Escolha o tamanho do contexto')
            .addChoices(
              { name: 'compacto (~1k tokens)', value: 'compacto' },
              { name: 'expandido (~3k tokens)', value: 'expandido' }
            )
        )
    )
    .toJSON()
];

async function main() {
  const rest = new REST({ version: '10' }).setToken(discordToken);
  await rest.put(Routes.applicationGuildCommands(discordAppId, allowedGuildId), {
    body: commands
  });
  console.log('✅ Slash commands registrados no guild.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
