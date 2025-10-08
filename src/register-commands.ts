import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from './config.js';

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
