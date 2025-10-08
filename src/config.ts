import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_APP_ID: z.string().optional(),
  ALLOWED_GUILD_ID: z.string().optional(),
  OLLAMA_HOST: z.string().default('http://127.0.0.1:11434'),
  MODEL: z.string().default('gemma3:4b'),
  PASSIVE_INTERVAL: z.coerce.number().int().min(1).default(10),
  PASSIVE_CONTEXT_MESSAGES: z.coerce.number().int().min(1).max(10).default(3),
  USER_CONTEXT_WINDOW: z.coerce.number().int().min(1).max(20).default(10),
  DB_PATH: z.string().default('data/roast.db')
});

const env = envSchema.parse(process.env);

export const config = {
  discordToken: env.DISCORD_TOKEN,
  discordAppId: env.DISCORD_APP_ID,
  allowedGuildId: env.ALLOWED_GUILD_ID,
  ollamaHost: env.OLLAMA_HOST,
  model: env.MODEL,
  passiveInterval: env.PASSIVE_INTERVAL,
  passiveContextMessages: env.PASSIVE_CONTEXT_MESSAGES,
  userContextWindow: env.USER_CONTEXT_WINDOW,
  dbPath: env.DB_PATH
};
