import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.ts';
import { log } from './logger.ts';
import { onInteractionCreate } from './listeners/interactionCreate.ts';
import { onMessageCreate } from './listeners/messageCreate.ts';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, (ready) => {
  log.info(`Logged in as ${ready.user.tag}`);
});

client.on(Events.InteractionCreate, onInteractionCreate);
client.on(Events.MessageCreate, onMessageCreate);

client.login(config.discordToken);
