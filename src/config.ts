import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_APP_ID: z.string().optional(),
  ALLOWED_GUILD_ID: z.string().optional(),
  OLLAMA_HOST: z.string().default("http://127.0.0.1:11434"),
  MODEL: z.string().default("gemma3:4b"),
  LLM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(30_000),
  LLM_RETRY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(90_000)
    .default(22_000),
  PASSIVE_INTERVAL: z.coerce.number().int().min(1).default(10),
  PASSIVE_CONTEXT_MESSAGES: z.coerce.number().int().min(1).max(10).default(3),
  DB_PATH: z.string().default("data/roast.db"),
  USER_CONTEXT_WINDOW: z.coerce.number().int().min(1).max(20).default(10),
  PROFILE_REFRESH_MIN_MESSAGES: z.coerce.number().int().min(5).default(25),
  PROFILE_REFRESH_MIN_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .default(10 * 60 * 1000),
  PROFILE_RECENT_MESSAGE_LIMIT: z.coerce
    .number()
    .int()
    .min(50)
    .max(500)
    .default(300),
  CONTEXT_COMPACT_BUDGET: z.coerce.number().int().min(200).default(1000),
  CONTEXT_EXTENDED_BUDGET: z.coerce.number().int().min(400).default(3000),
  CONTEXT_SNIPPET_LIMIT: z.coerce.number().int().min(1).max(8).default(3),
  SNIPPET_DECAY_FACTOR: z.coerce.number().min(0.5).max(1).default(0.97),
  SNIPPET_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.2),
});

const env = envSchema.parse(process.env);

export const config = {
  discordToken: env.DISCORD_TOKEN,
  discordAppId: env.DISCORD_APP_ID,
  allowedGuildId: env.ALLOWED_GUILD_ID,
  ollamaHost: env.OLLAMA_HOST,
  model: env.MODEL,
  llmTimeoutMs: env.LLM_TIMEOUT_MS,
  llmRetryTimeoutMs: env.LLM_RETRY_TIMEOUT_MS,
  passiveInterval: env.PASSIVE_INTERVAL,
  passiveContextMessages: env.PASSIVE_CONTEXT_MESSAGES,
  userContextWindow: env.USER_CONTEXT_WINDOW,
  dbPath: env.DB_PATH,
  profileRefreshMinMessages: env.PROFILE_REFRESH_MIN_MESSAGES,
  profileRefreshMinIntervalMs: env.PROFILE_REFRESH_MIN_INTERVAL_MS,
  profileRecentMessageLimit: env.PROFILE_RECENT_MESSAGE_LIMIT,
  contextCompactBudget: env.CONTEXT_COMPACT_BUDGET,
  contextExtendedBudget: env.CONTEXT_EXTENDED_BUDGET,
  contextSnippetLimit: env.CONTEXT_SNIPPET_LIMIT,
  snippetDecayFactor: env.SNIPPET_DECAY_FACTOR,
  snippetMinScore: env.SNIPPET_MIN_SCORE,
};
