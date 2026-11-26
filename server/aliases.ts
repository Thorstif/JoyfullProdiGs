// Nametag gag: the header usually shows your real name, but now and then slips to one of these.
// Defaults by first name (case-insensitive). The Game Master can edit them per player in the GM panel.
import { db } from './db.ts';

export const DEFAULT_ALIASES: Record<string, string[]> = {
  jens: ['Ivar'],
  ivar: ['Jens'],
  christoffer: ['Kristoffer', 'Christopher', 'Kristopher', '🍞'],
  nikolai: ['👶', 'Dokken', '🍼', '👼', '🐣'],
  simen: ['🤓'],
  'thor-stian': ['Game Monster', 'Thor-Stain', 'Tor-Stian', '🔨', 'Thor-Stian (self-appointed)'],
};

export function parseAliases(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  return list.map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 12);
}

export function aliasesOf(p: { aliases?: string | null }): string[] {
  try {
    return p.aliases ? parseAliases(JSON.parse(p.aliases)) : [];
  } catch {
    return [];
  }
}

// Fill in defaults for players that have never had aliases set (NULL; an empty list stays empty)
export function applyDefaultAliases() {
  const rows = db.prepare('SELECT id, name FROM players WHERE aliases IS NULL').all() as { id: number; name: string }[];
  const upd = db.prepare('UPDATE players SET aliases = ? WHERE id = ?');
  for (const r of rows) {
    const d = DEFAULT_ALIASES[r.name.trim().toLowerCase()];
    if (d) upd.run(JSON.stringify(d), r.id);
  }
}
