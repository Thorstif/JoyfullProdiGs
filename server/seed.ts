import { db } from './db.ts';
import { seedPlayers } from './seedlib.ts';

// Usage: npm run seed -- "Thor-Stian*" Nikolai Christoffer Simen "Jens~" "Ivar~"
// A trailing * marks the Game Master. A trailing ~ on exactly two names makes them the
// "mistaken identity" pair (changeable later in the GM panel). Pass --reset to wipe all game data first.
const args = process.argv.slice(2);
const reset = args.includes('--reset');
const names = args.filter((a) => a !== '--reset');

const existing = (db.prepare('SELECT COUNT(*) n FROM players').get() as { n: number }).n;
if (existing && !reset) {
  console.log('Players already exist. Current codes:');
  for (const p of db.prepare('SELECT name, code, is_gm FROM players').all() as any[]) {
    console.log(`  ${p.name.padEnd(12)} ${p.code}${p.is_gm ? '   (Game Master)' : ''}`);
  }
  console.log('\nRun with --reset to start over (deletes all scores, missions and subscriptions).');
  process.exit(0);
}
if (!names.length) {
  console.log('Usage: npm run seed -- "Thor-Stian*" Nikolai Christoffer Simen "Jens~" "Ivar~"');
  process.exit(1);
}

if (reset) {
  for (const t of ['claims', 'bounties', 'achievements', 'respect_log', 'feed', 'missions', 'push_subs', 'players']) db.exec(`DELETE FROM ${t}`);
  db.exec("DELETE FROM settings WHERE key NOT IN ('vapid_public','vapid_private')");
  db.exec('UPDATE mission_pool SET used = 0');
}

seedPlayers(names, process.env.GM_CODE || '');
