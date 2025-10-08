// src/register-commands.ts
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const { DISCORD_TOKEN, DISCORD_APP_ID, ALLOWED_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_APP_ID || !ALLOWED_GUILD_ID) {
  throw new Error('Missing env: DISCORD_TOKEN / DISCORD_APP_ID / ALLOWED_GUILD_ID');
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Pong!').toJSON(),
  new SlashCommandBuilder()
    .setName('roastme')
    .setDescription('Receba um roast (opt-in).')
    .addIntegerOption(o =>
      o.setName('intensidade').setDescription('0=leve, 1=moderado, 2=picante').setMinValue(0).setMaxValue(2)
    )
    .addIntegerOption(o =>
      o.setName('contexto').setDescription('Mensagens recentes para contexto (0–15)').setMinValue(0).setMaxValue(15)
    )
    .toJSON()
];

async function main() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);
  await rest.put(Routes.applicationGuildCommands(DISCORD_APP_ID!, ALLOWED_GUILD_ID!), { body: commands });
  console.log('✅ Slash commands registrados no guild.');
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
