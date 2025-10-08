import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials,
  TextChannel
} from 'discord.js';
import pino from 'pino';
import { request } from 'undici';

const log = pino({ transport: { target: 'pino-pretty' } });

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const MODEL = process.env.MODEL ?? 'gemma3:4b';
const { DISCORD_TOKEN, ALLOWED_GUILD_ID } = process.env;

if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN');

async function chatOllama(messages: { role:'system'|'user'|'assistant'; content:string }[], temperature=0.8) {
  const { body } = await request(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, options: { temperature } })
  });
  const json: any = await body.json();
  return json?.message?.content ?? '';
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

client.once('ready', () => log.info(`Logged in as ${client.user?.tag}`));

client.on('interactionCreate', async (itx) => {
  try {
    if (!itx.isChatInputCommand()) return;
    if (ALLOWED_GUILD_ID && itx.guildId !== ALLOWED_GUILD_ID) {
      return itx.reply({ content: 'Servidor não autorizado.', ephemeral: true });
    }

    if (itx.commandName === 'ping') {
      return itx.reply({ content: 'Pong!', ephemeral: true });
    }

    if (itx.commandName === 'roastme') {
      const intensidade = (itx.options.getInteger('intensidade') ?? 1) as 0 | 1 | 2;
      const contexto = Math.min(Math.max(itx.options.getInteger('contexto') ?? 5, 0), 15);

      await itx.deferReply();

      let history = '';
      if (contexto > 0 && itx.channel && itx.channel.isTextBased()) {
        const msgs = await (itx.channel as TextChannel).messages.fetch({ limit: contexto });
        const arr = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        history = arr.map(m => `${m.author.username}: ${m.content?.slice(0, 200)}`).join('\n');
      }

      const system = [
        `You are a witty roast assistant. Level: ${['light','witty','spicy-safe'][intensidade]}.`,
        'Avoid slurs/harassment/violence. Keep it under ~80 words.'
      ].join('\n');

      const userPrompt = [
        `Requester: ${itx.user.username}`,
        history ? `Recent chat:\n${history}` : 'No recent chat provided.',
        'Craft one single roast reply to the requester.'
      ].join('\n\n');

      const reply = await chatOllama(
        [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
        0.9
      );

      await itx.editReply(reply || 'Sem graça hoje, tenta outra.');
    }
  } catch (e) {
    log.error(e);
    if (itx.isRepliable()) itx.reply({ content: 'Erro. Veja logs.', ephemeral: true }).catch(() => {});
  }
});

client.login(DISCORD_TOKEN);
