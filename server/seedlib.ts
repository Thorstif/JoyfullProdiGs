import crypto from 'node:crypto';
import { db, setSetting } from './db.ts';

// Creates players from names like "Thor-Stian*" (Game Master) and "Jens~" (mix-up pair).
// gmCode optionally fixes the Game Master's invite code, so it can be set before the server exists.
export function seedPlayers(names: string[], gmCode = '') {
  const WORDS = ['ACE', 'BOSS', 'COBRA', 'DIESEL', 'EAGLE', 'FOX', 'GHOST', 'HAWK', 'JOKER', 'KING', 'LYNX', 'NOMAD', 'RAVEN', 'TIGER', 'VIPER', 'WOLF'];
  const used = new Set<string>();
  const ins = db.prepare('INSERT INTO players (name, code, is_gm) VALUES (?, ?, ?)');
  console.log('Invite codes (hand one to each player):\n');
  const twins: number[] = [];
  for (const raw of names) {
    const isGm = /\*~?$|~\*$/.test(raw);
    const isTwin = /~\*?$|\*~$/.test(raw);
    const name = raw.replace(/[*~]+$/, '');
    let code: string;
    do {
      code = `${WORDS[crypto.randomInt(WORDS.length)]}-${crypto.randomInt(1000, 10000)}`;
    } while (used.has(code));
    if (isGm && gmCode) code = gmCode.toUpperCase();
    used.add(code);
    const id = Number(ins.run(name, code, isGm ? 1 : 0).lastInsertRowid);
    if (isTwin) twins.push(id);
    console.log(`  ${name.padEnd(12)} ${code}${isGm ? '   (Game Master)' : ''}${isTwin ? '   (mix-up pair)' : ''}`);
  }
  if (twins.length === 2) {
    setSetting('twin_a', String(twins[0]));
    setSetting('twin_b', String(twins[1]));
    console.log('\nMix-up gag set. Print the QR cards from the GM panel: their cards carry each other\'s names.');
  } else if (twins.length) {
    console.log('\nMark exactly two players with ~ for the mix-up gag. Skipped.');
  }
}
