import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(path.join(config.dataDir, 'game.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  token TEXT UNIQUE,
  is_gm INTEGER NOT NULL DEFAULT 0,
  respect INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT
);
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  sub_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- kind: side | world | mystery | gm
CREATE TABLE IF NOT EXISTS missions (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward INTEGER NOT NULL DEFAULT 0,
  target_player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  max_winners INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- status: pending | approved | rejected
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  awarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (mission_id, player_id)
);
-- status: open | claimed | paid | cancelled
CREATE TABLE IF NOT EXISTS bounties (
  id INTEGER PRIMARY KEY,
  issuer_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stake INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  claimant_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  claim_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (player_id, key)
);
CREATE TABLE IF NOT EXISTS respect_log (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- public news feed; player_id set means only that player sees it
CREATE TABLE IF NOT EXISTS feed (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- templates the scheduler draws random side missions / mystery events from
CREATE TABLE IF NOT EXISTS mission_pool (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'side',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward INTEGER NOT NULL DEFAULT 25,
  used INTEGER NOT NULL DEFAULT 0
);
-- The Crown: one at a time, anyone can hand it to anyone. Latest row = current holder.
CREATE TABLE IF NOT EXISTS crown_log (
  id INTEGER PRIMARY KEY,
  from_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  to_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  bonus INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export type Player = {
  id: number;
  name: string;
  code: string;
  token: string | null;
  is_gm: number;
  respect: number;
  joined_at: string | null;
  last_seen?: string | null;
  aliases?: string | null;
};

export type Mission = {
  id: number;
  kind: string;
  title: string;
  description: string;
  reward: number;
  target_player_id: number | null;
  max_winners: number;
  expires_at: string | null;
  closed: number;
  created_at: string;
};

// Small migrations for databases created by earlier versions
try {
  db.exec('ALTER TABLE crown_log ADD COLUMN bonus INTEGER NOT NULL DEFAULT 0');
} catch {}
try {
  db.exec('ALTER TABLE players ADD COLUMN last_seen TEXT');
} catch {}
try {
  db.exec('ALTER TABLE players ADD COLUMN aliases TEXT');
} catch {}
try {
  db.exec('ALTER TABLE missions ADD COLUMN pool_id INTEGER');
} catch {}
try {
  db.exec('ALTER TABLE mission_pool ADD COLUMN vetoed INTEGER NOT NULL DEFAULT 0');
} catch {}

// Time zone can be changed live from the GM panel (useful once the destination is known)
export function tz() {
  const v = getSetting('tz');
  if (v) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: v });
      return v;
    } catch {}
  }
  return config.tz;
}

export function localHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz() }).format(date)) % 24;
}

// Hourly SQLite backups, keeping the last 48. Restore = stop server, copy a backup over game.db.
export async function backupNow() {
  const dir = path.join(config.dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `game-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  await db.backup(file);
  const all = fs.readdirSync(dir).filter((f) => f.startsWith('game-')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 48))) fs.unlinkSync(path.join(dir, old));
  return file;
}
