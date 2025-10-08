import {
  Client,
  GatewayIntentBits,
  Message,
  MessageFlags,
  Partials
} from 'discord.js';
import pino from 'pino';
import { request } from 'undici';
import { config } from './config.js';
import { appendUserMessageContext, getUserContext } from './db.js';

type ChannelMessage = {
  userId: string;
  username: string;
  content: string;
};

type ChannelState = {
  count: number;
  buffer: ChannelMessage[];
  busy: boolean;
};

const log = pino({ transport: { target: 'pino-pretty' } });

async function chatOllama(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature = 0.8
) {
  const { body, statusCode } = await request(`${config.ollamaHost}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages, options: { temperature } })
  });

  if (statusCode < 200 || statusCode >= 300) {
    const errorText = await body.text();
    throw new Error(`Ollama responded ${statusCode}: ${errorText}`);
  }

  const json: any = await body.json();
  return json?.message?.content?.trim() ?? '';
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const channelStates = new Map<string, ChannelState>();

client.once('clientReady', () => log.info(`Logged in as ${client.user?.tag}`));

client.on('interactionCreate', async (itx) => {
  try {
    if (!itx.isChatInputCommand()) return;
    if (config.allowedGuildId && itx.guildId !== config.allowedGuildId) {
      return itx.reply({ content: 'Servidor não autorizado.', flags: MessageFlags.Ephemeral });
    }

    if (itx.commandName === 'ping') {
      return itx.reply({ content: 'Pong!', flags: MessageFlags.Ephemeral });
    }

    if (itx.commandName === 'roastme') {
      const intensidade = (itx.options.getInteger('intensidade') ?? 1) as 0 | 1 | 2;
      const contexto = Math.min(Math.max(itx.options.getInteger('contexto') ?? 5, 0), 15);

      await itx.deferReply({ flags: MessageFlags.Ephemeral });

      let history = '';
      if (
        contexto > 0 &&
        itx.channel &&
        itx.channel.isTextBased() &&
        'messages' in itx.channel
      ) {
        const msgs = await itx.channel.messages.fetch({ limit: contexto });
        const arr = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        history = arr
          .map((m) => `${m.author.username}: ${sanitizeForPrompt(m.cleanContent)}`)
          .filter(Boolean)
          .join('\n');
      }

      const system = [
        `You are a witty roast assistant. Level: ${['light', 'witty', 'spicy-safe'][intensidade]}.`,
        'Avoid slurs/harassment/violence. Keep it under ~80 words.'
      ].join('\n');

      const longTermContext =
        itx.guildId && getUserContext(itx.guildId, itx.user.id);

      const userPrompt = [
        `Requester: ${itx.user.username}`,
        history ? `Recent chat:\n${history}` : 'No recent chat provided.',
        longTermContext ? `User context:\n${longTermContext}` : 'No stored context for this user.',
        'Craft a single roast reply addressed to the requester.'
      ]
        .filter(Boolean)
        .join('\n\n');

      const reply = await chatOllama(
        [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
        0.9
      );

      await itx.editReply(reply || 'Sem graça hoje, tenta outra.');
    }
  } catch (error) {
    log.error({ err: error }, 'interaction error');
    if (itx.isRepliable()) {
      const response = 'Erro. Veja logs.';
      if (itx.deferred || itx.replied) {
        await itx.editReply(response).catch(() => {});
      } else {
        await itx.reply({ content: response, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }
});

client.on('messageCreate', async (message) => {
  if (!message.guildId) return;
  if (message.author.bot) return;
  if (config.allowedGuildId && message.guildId !== config.allowedGuildId) return;
  if (!message.channel.isTextBased()) return;
  if (!message.cleanContent?.trim()) return;

  appendUserMessageContext(message.guildId, message.author.id, message.cleanContent);

  const state = getChannelState(message.channelId);
  state.buffer.push({
    userId: message.author.id,
    username: message.member?.displayName ?? message.author.username,
    content: sanitizeForPrompt(message.cleanContent)
  });
  trimBuffer(state.buffer, config.passiveContextMessages);
  state.count += 1;

  if (state.busy) return;
  if (state.count < config.passiveInterval) return;

  state.count = 0;
  state.busy = true;

  try {
    const reply = await generatePassiveRoast(message, state.buffer.slice());
    if (reply) {
      await message.channel.send(reply);
    }
  } catch (error) {
    log.error({ err: error }, 'passive roast failed');
  } finally {
    state.busy = false;
  }
});

async function generatePassiveRoast(message: Message, buffer: ChannelMessage[]) {
  if (!buffer.length) return null;

  const last = buffer[buffer.length - 1];
  const history = buffer.map((entry) => `${entry.username}: ${entry.content}`).join('\n');

  const uniqueUserIds = [...new Set(buffer.map((entry) => entry.userId))];
  const longTermContext = message.guildId
    ? uniqueUserIds
        .map((id) => {
          const ctx = getUserContext(message.guildId!, id);
          if (!ctx) return null;
          const username = buffer.find((entry) => entry.userId === id)?.username;
          return username ? `Context for ${username}: ${ctx}` : null;
        })
        .filter(Boolean)
        .join('\n')
    : null;

  const systemPrompt = [
    'You are a playful Discord bot that delivers witty roasts based on the conversation context.',
    'Avoid hateful, violent, or explicit content. Keep replies under 60 words.',
    `Focus the roast on ${last.username}, referencing the recent conversation when useful.`
  ].join(' ');

  const userPrompt = [
    `Recent conversation:\n${history}`,
    longTermContext ? `Stored context:\n${longTermContext}` : 'No additional stored context.'
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await chatOllama(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${userPrompt}\n\nReply with a single roast sentence.` }
    ],
    0.9
  );

  return response;
}

function getChannelState(channelId: string): ChannelState {
  let state = channelStates.get(channelId);
  if (!state) {
    state = { count: 0, buffer: [], busy: false };
    channelStates.set(channelId, state);
  }
  return state;
}

function trimBuffer(buffer: ChannelMessage[], max: number) {
  while (buffer.length > max) {
    buffer.shift();
  }
}

function sanitizeForPrompt(content: string | null): string {
  if (!content) return '';
  return content.replace(/\s+/g, ' ').trim().slice(0, 240);
}

client.login(config.discordToken);
