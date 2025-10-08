import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
  MessageFlags,
  Partials
} from 'discord.js';
import pino from 'pino';
import { request } from 'undici';
import { config } from './config.ts';
import { appendUserMessageContext, getUserContext } from './db.ts';

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
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages,
      options: { temperature }
    })
  });

  if (statusCode < 200 || statusCode >= 300) {
    const errorText = await body.text();
    throw new Error(`Ollama responded ${statusCode}: ${errorText}`);
  }

  const raw = await body.text();

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    const snippet = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
    throw new Error(`Failed to parse Ollama response: ${snippet}`);
  }

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

client.once(Events.ClientReady, (readyClient) =>
  log.info(`Logged in as ${readyClient.user.tag}`)
);

client.on('interactionCreate', async (itx) => {
  try {
    if (!itx.isChatInputCommand()) return;
    if (config.allowedGuildId && itx.guildId !== config.allowedGuildId) {
      return itx.reply({
        content: 'Servidor não autorizado.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (itx.commandName === 'ping') {
      return itx.reply({ content: 'Pong!', flags: MessageFlags.Ephemeral });
    }

    if (itx.commandName === 'roastme') {
      const intensidade = (itx.options.getInteger('intensidade') ?? 1) as 0 | 1 | 2;
      const contexto = Math.min(Math.max(itx.options.getInteger('contexto') ?? 5, 0), 15);

      await itx.deferReply();

      let history = '';
      if (contexto > 0 && itx.channel?.isTextBased()) {
        const channel = itx.channel;
        if ('messages' in channel && typeof channel.messages?.fetch === 'function') {
          const msgs = await channel.messages.fetch({ limit: contexto });
          const arr = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
          history = arr
            .map((m) => `${m.author.username}: ${sanitizeForPrompt(m.cleanContent)}`)
            .filter(Boolean)
            .join('\n');
        }
      }

      const intensityLabels: Record<0 | 1 | 2, string> = {
        0: 'sharply sarcastic but still playful',
        1: 'brutal, explicit, and wildly disrespectful',
        2: 'feral, merciless, and outrageously offensive'
      };

      const system = [
        'You are an unfiltered roast demon built to verbally eviscerate people.',
        `Current aggression level: ${intensityLabels[intensidade]}.`,
        'Let loose with profanity, dark humor, and deeply personal jabs; hold nothing back unless it would be illegal or targeted hate speech.',
        'Keep the reply under ~80 words and deliver it as a single cutting message addressed to the requester.'
      ].join('\n');

      let longTermContext: string | null = null;
      if (itx.guildId) {
        try {
          longTermContext = getUserContext(itx.guildId, itx.user.id);
        } catch (error) {
          log.warn({ err: error }, 'failed to load user context');
          longTermContext = null;
        }
      }

      const normalizedContext = longTermContext?.trim();

      const userPromptParts = [
        `Requester: ${itx.user.username}`,
        `Intensity instructions: ${intensityLabels[intensidade]}. Go wild and raw.`,
        history ? `Recent chat:\n${history}` : 'No recent chat provided.'
      ];
      if (normalizedContext != null) {
        if (normalizedContext.length) {
          userPromptParts.push(`User context:\n${normalizedContext}`);
        } else {
          userPromptParts.push('User context: (no stored messages yet)');
        }
      } else {
        userPromptParts.push('No stored context for this user.');
      }
      userPromptParts.push('Craft a single roast reply addressed to the requester.');

      const userPrompt = userPromptParts.join('\n\n');

      log.info(
        {
          scope: 'roastme',
          guildId: itx.guildId,
          userId: itx.user.id,
          intensidade,
          contexto,
          history,
          longTermContext: normalizedContext
        },
        'assembled roastme context'
      );

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

  const guildId = message.guildId;
  if (!guildId) return null;

  const last = buffer[buffer.length - 1];

  const history = buffer.map((entry) => `${entry.username}: ${entry.content}`).join('\n');

  const displayNamesByUser = new Map<string, string>();
  for (const entry of buffer) {
    if (!displayNamesByUser.has(entry.userId)) {
      displayNamesByUser.set(entry.userId, entry.username);
    }
  }

  const contexts: string[] = [];
  const contextErrors: { userId: string; message: string }[] = [];

  for (const [userId, username] of displayNamesByUser.entries()) {
    try {
      const ctx = getUserContext(guildId, userId);
      if (ctx == null) continue;

      const trimmed = ctx.trim();
      contexts.push(
        trimmed ? `Context for ${username}: ${trimmed}` : `Context for ${username}: (no stored messages yet)`
      );
    } catch (error) {
      contextErrors.push({ userId, message: (error as Error).message });
    }
  }

  if (contextErrors.length) {
    log.warn({ errors: contextErrors }, 'failed to load passive context for some users');
  }

  const longTermContext = contexts.length ? contexts.join('\n') : null;

  const systemPrompt = [
    'You are an unleashed Discord roast engine engineered to hit below the belt.',
    'Profanity, dark humor, brutal honesty, and explicit insults are all encouraged. Only avoid direct hate speech against protected groups or explicit threats of real-world harm.',
    `Focus the roast on ${last.username}, weaponizing the recent conversation and any stored context.`
  ].join(' ');

  const userPromptParts = [
    `Recent conversation:\n${history}`,
    'Tone directive: go absolutely feral, scorch the target, and do not hold back.'
  ];
  if (longTermContext) {
    userPromptParts.push(`Stored context:\n${longTermContext}`);
  } else {
    userPromptParts.push('No additional stored context.');
  }

  const userPrompt = userPromptParts.join('\n\n');

  log.info(
    {
      scope: 'passive-roast',
      guildId,
      channelId: message.channelId,
      targetUserId: last.userId,
      bufferSize: buffer.length,
      contextsLoaded: contexts.length,
      history,
      longTermContext
    },
    'assembled passive roast context'
  );

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
