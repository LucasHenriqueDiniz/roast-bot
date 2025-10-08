import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.ts';

const dbFile = resolve(config.dbPath);
mkdirSync(dirname(dbFile), { recursive: true });

export const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_user_ts ON messages (guild_id, user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_messages_guild_channel_ts ON messages (guild_id, channel_id, ts DESC);

CREATE TABLE IF NOT EXISTS user_profiles (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  quirks_json TEXT NOT NULL,
  last_update_ts INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  excerpt TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  score REAL NOT NULL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_user_snippets_user_score ON user_snippets (guild_id, user_id, score DESC);

CREATE TABLE IF NOT EXISTS users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  opted_in INTEGER NOT NULL DEFAULT 0,
  default_intensity INTEGER NOT NULL DEFAULT 1,
  style TEXT DEFAULT 'witty',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
`);

export type StoredMessage = {
  id: number;
  guildId: string;
  channelId: string;
  userId: string;
  ts: number;
  content: string;
};

const insertMessageStmt = db.prepare<[
  { guildId: string; channelId: string; userId: string; ts: number; content: string }
]>(
  `INSERT INTO messages (guild_id, channel_id, user_id, ts, content)
   VALUES (@guildId, @channelId, @userId, @ts, @content)`
);

const selectRecentMessagesStmt = db.prepare(
  `SELECT id, guild_id as guildId, channel_id as channelId, user_id as userId, ts, content
   FROM messages
   WHERE guild_id = @guildId AND user_id = @userId
   ORDER BY ts DESC
   LIMIT @limit`
);

const countMessagesSinceStmt = db.prepare(
  `SELECT COUNT(*) as count
   FROM messages
   WHERE guild_id = @guildId AND user_id = @userId AND ts > @ts`
);

const selectRecentChannelMessagesStmt = db.prepare(
  `SELECT id, guild_id as guildId, channel_id as channelId, user_id as userId, ts, content
   FROM messages
   WHERE guild_id = @guildId AND channel_id = @channelId
   ORDER BY ts DESC
   LIMIT @limit`
);

const getProfileStmt = db.prepare<[
  { guildId: string; userId: string }
], { summary: string; quirks_json: string; last_update_ts: number } | undefined>(
  `SELECT summary, quirks_json, last_update_ts
   FROM user_profiles
   WHERE guild_id = @guildId AND user_id = @userId`
);

const upsertProfileStmt = db.prepare<[
  { guildId: string; userId: string; summary: string; quirksJson: string; updatedAt: number }
]>(
  `INSERT INTO user_profiles (guild_id, user_id, summary, quirks_json, last_update_ts)
   VALUES (@guildId, @userId, @summary, @quirksJson, @updatedAt)
   ON CONFLICT(guild_id, user_id) DO UPDATE SET
     summary = excluded.summary,
     quirks_json = excluded.quirks_json,
     last_update_ts = excluded.last_update_ts`
);

const insertSnippetStmt = db.prepare<[
  { guildId: string; userId: string; ts: number; excerpt: string; tags: string; score: number }
]>(
  `INSERT INTO user_snippets (guild_id, user_id, ts, excerpt, tags, score)
   VALUES (@guildId, @userId, @ts, @excerpt, @tags, @score)`
);

const selectTopSnippetsStmt = db.prepare(
  `SELECT id, excerpt, tags, score, ts
   FROM user_snippets
   WHERE guild_id = @guildId AND user_id = @userId
   ORDER BY score DESC, ts DESC
   LIMIT @limit`
);

const decaySnippetsStmt = db.prepare<[
  { guildId: string; userId: string; factor: number }
]>(
  `UPDATE user_snippets SET score = score * @factor WHERE guild_id = @guildId AND user_id = @userId`
);

const pruneSnippetsStmt = db.prepare<[
  { guildId: string; userId: string; minScore: number }
]>(
  `DELETE FROM user_snippets WHERE guild_id = @guildId AND user_id = @userId AND score < @minScore`
);

export function storeMessage(
  guildId: string,
  channelId: string,
  userId: string,
  ts: number,
  content: string
) {
  insertMessageStmt.run({ guildId, channelId, userId, ts, content });
}

export function getRecentMessagesForUser(
  guildId: string,
  userId: string,
  limit: number
): StoredMessage[] {
  const rows = selectRecentMessagesStmt.all({ guildId, userId, limit }) as {
    id: number;
    guildId: string;
    channelId: string;
    userId: string;
    ts: number;
    content: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    userId: row.userId,
    ts: row.ts,
    content: row.content
  }));
}

export function countMessagesSince(
  guildId: string,
  userId: string,
  ts: number
): number {
  const result = countMessagesSinceStmt.get({ guildId, userId, ts }) as { count?: number } | undefined;
  return result?.count ?? 0;
}

export function getRecentChannelMessages(
  guildId: string,
  channelId: string,
  limit: number
): StoredMessage[] {
  const rows = selectRecentChannelMessagesStmt.all({ guildId, channelId, limit }) as {
    id: number;
    guildId: string;
    channelId: string;
    userId: string;
    ts: number;
    content: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    userId: row.userId,
    ts: row.ts,
    content: row.content
  }));
}

export type UserProfileRecord = {
  summary: string;
  quirksJson: string;
  lastUpdateTs: number;
};

export function getUserProfile(
  guildId: string,
  userId: string
): UserProfileRecord | null {
  const row = getProfileStmt.get({ guildId, userId });
  if (!row) return null;
  return {
    summary: row.summary,
    quirksJson: row.quirks_json,
    lastUpdateTs: row.last_update_ts
  };
}

export function upsertUserProfile(
  guildId: string,
  userId: string,
  summary: string,
  quirksJson: string,
  updatedAt: number
) {
  upsertProfileStmt.run({ guildId, userId, summary, quirksJson, updatedAt });
}

export type UserSnippet = {
  id: number;
  excerpt: string;
  tags: string[];
  score: number;
  ts: number;
};

export function insertUserSnippet(
  guildId: string,
  userId: string,
  ts: number,
  excerpt: string,
  tags: string[],
  score: number
) {
  insertSnippetStmt.run({ guildId, userId, ts, excerpt, tags: JSON.stringify(tags), score });
}

export function getTopSnippets(
  guildId: string,
  userId: string,
  limit: number
): UserSnippet[] {
  const rows = selectTopSnippetsStmt.all({ guildId, userId, limit }) as unknown as {
    id: number;
    excerpt: string;
    tags: string;
    score: number;
    ts: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    excerpt: row.excerpt,
    tags: safeParseTags(row.tags),
    score: row.score,
    ts: row.ts
  }));
}

export function decaySnippets(guildId: string, userId: string, factor: number) {
  decaySnippetsStmt.run({ guildId, userId, factor });
}

export function pruneSnippets(guildId: string, userId: string, minScore: number) {
  pruneSnippetsStmt.run({ guildId, userId, minScore });
}

function safeParseTags(input: string): string[] {
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // ignore
  }
  return [];
}
