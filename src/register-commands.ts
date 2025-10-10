import { ChannelType, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from './config.ts';
import { log } from './logger.ts';
import { LANGUAGE_CHOICES } from './settings/languages.ts';
import { PERSONALITY_CHOICES } from './settings/personalities.ts';

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

const slashCommands = [
  new SlashCommandBuilder()
    .setName('roastme')
    .setDescription('Receba um roast pesado utilizando seu contexto armazenado.')
    .addIntegerOption((option) =>
      option
        .setName('intensidade')
        .setDescription('0=leve, 1=moderado, 2=feroz')
        .setMinValue(0)
        .setMaxValue(2)
    )
    .addIntegerOption((option) =>
      option
        .setName('contexto')
        .setDescription('Mensagens recentes extras para compor o roast (0-15)')
        .setMinValue(0)
        .setMaxValue(15)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('updatecontext')
    .setDescription('Reconstrói o contexto (3k tokens) para você ou outro usuário.')
    .addUserOption((option) => option.setName('usuario').setDescription('Usuário alvo'))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('personality')
    .setDescription('Consulta ou altera a personalidade global do servidor.')
    .addStringOption((option) => {
      option.setName('tipo').setDescription('Nova personalidade para o servidor');
      PERSONALITY_CHOICES.forEach((choice) => option.addChoices({ name: choice.name, value: choice.value }));
      return option;
    })
    .toJSON(),
  new SlashCommandBuilder()
    .setName('language')
    .setDescription('Consulta ou altera o idioma usado nas respostas do bot.')
    .addStringOption((option) => {
      option.setName('idioma').setDescription('Novo idioma para o servidor');
      LANGUAGE_CHOICES.forEach((choice) => option.addChoices({ name: choice.name, value: choice.value }));
      return option;
    })
    .toJSON(),
  new SlashCommandBuilder()
    .setName('forcemessageevent')
    .setDescription('Força um disparo do modo passivo no canal escolhido.')
    .addChannelOption((option) =>
      option
        .setName('canal')
        .setDescription('Canal onde o roast será enviado')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread
        )
    )
    .addUserOption((option) => option.setName('usuario').setDescription('Usuário preferencial para ser alvo'))
    .addIntegerOption((option) =>
      option
        .setName('contexto')
        .setDescription('Mensagens mínimas para coletar antes do roast')
        .setMinValue(1)
        .setMaxValue(30)
    )
    .toJSON()
];

export async function registerGuildCommands(options: { skipIfMissingEnv?: boolean } = {}) {
  const { skipIfMissingEnv = false } = options;
  const discordAppId = config.discordAppId;
  const allowedGuildId = config.allowedGuildId;

  if (skipIfMissingEnv && (!discordAppId || !allowedGuildId)) {
    log.warn('Skipping slash command registration: DISCORD_APP_ID or ALLOWED_GUILD_ID missing.');
    return;
  }

  const appId = requireEnv(discordAppId, 'DISCORD_APP_ID');
  const guildId = requireEnv(allowedGuildId, 'ALLOWED_GUILD_ID');
  const rest = new REST({ version: '10' }).setToken(requireEnv(config.discordToken, 'DISCORD_TOKEN'));

  await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: slashCommands });
  log.info({ guildId }, 'slash commands registered');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  registerGuildCommands()
    .then(() => {
      console.log('✅ Slash commands registrados no guild.');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
