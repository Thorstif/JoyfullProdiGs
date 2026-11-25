import cron from 'node-cron';
import { config } from './config.ts';
import { backupNow, db, getSetting, localHour, setSetting, tz } from './db.ts';
import { createMission, dailyRecap, finalStandings, players, reviewClaim, startGame } from './game.ts';

// All scheduler settings live in the settings table so the Game Master can change them live.
export const SCHED_DEFAULTS: Record<string, string> = {
  sched_enabled: '0', // off until the GM starts the game
  sched_active_from: '11', // local hour, inclusive
  sched_active_to: '23', // local hour, exclusive (24 = midnight)
  sched_min_gap: '150', // minutes between random side missions
  sched_max_gap: '240',
  sched_side_expiry: '90', // minutes a random side mission stays open
  sched_mystery_chance: '0.15', // chance per random drop that it is a secret mystery event for one player
  recap_enabled: '1',
  recap_hour: '9',
  final_scheduled_at: config.finalAt, // ISO time; empty = only when GM triggers it
};

export function sched(key: string) {
  return getSetting(key) ?? SCHED_DEFAULTS[key];
}


function scheduleNextDrop() {
  const min = Number(sched('sched_min_gap'));
  const max = Math.max(min, Number(sched('sched_max_gap')));
  const gap = min + Math.random() * (max - min);
  setSetting('next_drop_at', new Date(Date.now() + gap * 60_000).toISOString());
}

type PoolRow = { id: number; kind: string; title: string; description: string; reward: number; used: number };

export async function randomDrop() {
  const wantMystery = Math.random() < Number(sched('sched_mystery_chance'));
  const kind = wantMystery ? 'mystery' : 'side';
  const pick =
    (db.prepare('SELECT * FROM mission_pool WHERE kind = ? ORDER BY used ASC, RANDOM() LIMIT 1').get(kind) as PoolRow | undefined) ||
    (db.prepare('SELECT * FROM mission_pool ORDER BY used ASC, RANDOM() LIMIT 1').get() as PoolRow | undefined);
  if (!pick) return null;
  db.prepare('UPDATE mission_pool SET used = used + 1 WHERE id = ?').run(pick.id);
  let target: number | null = null;
  if (pick.kind === 'mystery') {
    const ps = players();
    target = ps[Math.floor(Math.random() * ps.length)]?.id ?? null;
  }
  return createMission({
    kind: pick.kind === 'mystery' ? 'mystery' : 'side',
    title: pick.title,
    description: pick.description,
    reward: pick.reward,
    targetPlayerId: target,
    maxWinners: target ? 1 : Number(getSetting('side_max_winners') || 1),
    expiresInMinutes: Number(sched('sched_side_expiry')),
  });
}

async function tick() {
  try {
    // Final standings at a fixed time, if set
    const finalAt = sched('final_scheduled_at');
    if (finalAt && !getSetting('final_at') && new Date(finalAt) <= new Date()) {
      await finalStandings();
    }
    // Fallback start: if the GM hasn't pressed Start by TRIP_START, the game starts itself
    if (config.tripStart && !getSetting('trip_started') && new Date(config.tripStart) <= new Date()) {
      await startGame();
    }
    // GM busy: approve claims that have waited too long (0 = off)
    const autoMin = Number(getSetting('auto_approve_min') || 0);
    if (autoMin > 0) {
      const old = db
        .prepare("SELECT id FROM claims WHERE status = 'pending' AND created_at < ?")
        .all(new Date(Date.now() - autoMin * 60_000).toISOString()) as { id: number }[];
      for (const c of old) await reviewClaim(c.id, true, null);
    }
    if (sched('sched_enabled') !== '1') return;
    const h = localHour();
    const from = Number(sched('sched_active_from'));
    const to = Number(sched('sched_active_to'));
    const active = from <= to ? h >= from && h < to : h >= from || h < to;
    if (!active) return;
    const next = getSetting('next_drop_at');
    if (!next) return scheduleNextDrop();
    if (new Date(next) <= new Date()) {
      await randomDrop();
      scheduleNextDrop();
    }
  } catch (err) {
    console.error('[scheduler] tick failed', err);
  }
}

export function startScheduler() {
  cron.schedule('*/5 * * * *', tick, { timezone: config.tz });
  // Daily recap: check at the top of every hour so the GM can change the hour live
  cron.schedule(
    '0 * * * *',
    async () => {
      try {
        if (sched('sched_enabled') !== '1' || sched('recap_enabled') !== '1') return;
        if (localHour() !== Number(sched('recap_hour'))) return;
        await dailyRecap();
      } catch (err) {
        console.error('[scheduler] recap failed', err);
      }
    },
    { timezone: config.tz },
  );
  cron.schedule('17 * * * *', () => backupNow().catch((e) => console.error('[backup] failed', e)));
  console.log(`[scheduler] running, time zone ${tz()}`);
  tick(); // catch up right away (e.g. trip start passed while the server was down)
}

export function resetDropTimer() {
  scheduleNextDrop();
}
