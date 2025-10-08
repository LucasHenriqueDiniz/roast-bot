import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';

const dbFile = resolve(config.dbPath);
mkdirSync(dirname(dbFile), { recursive: true });

export const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS user_contexts (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  messages TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
`);

type ContextRow = { messages: string };

const getUserContextStmt = db.prepare<[{ guildId: string; userId: string }], ContextRow | undefined>(
  'SELECT messages FROM user_contexts WHERE guild_id = @guildId AND user_id = @userId'
);

const upsertContextStmt = db.prepare<[
  { guildId: string; userId: string; messages: string; updatedAt: number }
]>(
  `INSERT INTO user_contexts (guild_id, user_id, messages, updated_at)
   VALUES (@guildId, @userId, @messages, @updatedAt)
   ON CONFLICT(guild_id, user_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`
);

const appendContextTx = db.transaction((params: { guildId: string; userId: string; content: string }) => {
  const existing = getUserContextStmt.get({ guildId: params.guildId, userId: params.userId });
  const now = Date.now();
  const normalized = normalizeMessage(params.content);

  let arr: string[] = [];
  if (existing?.messages) {
    try {
      const parsed = JSON.parse(existing.messages);
      if (Array.isArray(parsed)) {
        arr = parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      arr = [];
    }
  }

  arr.push(normalized);
  if (arr.length > config.userContextWindow) {
    arr = arr.slice(arr.length - config.userContextWindow);
  }

  const messages = JSON.stringify(arr);
  upsertContextStmt.run({
    guildId: params.guildId,
    userId: params.userId,
    messages,
    updatedAt: now
  });
});

function normalizeMessage(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function appendUserMessageContext(guildId: string, userId: string, content: string) {
  appendContextTx({ guildId, userId, content });
}

export function getUserContext(guildId: string, userId: string): string | null {
  const row = getUserContextStmt.get({ guildId, userId });
  if (!row?.messages) return null;
  try {
    const parsed = JSON.parse(row.messages);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === 'string').join('\n');
  } catch {
    return null;
  }
}
