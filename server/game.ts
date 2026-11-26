import { config } from './config.ts';
import { db, getSetting, localHour, setSetting, type Mission, type Player } from './db.ts';
import { pushToAll, pushToPlayer } from './push.ts';

const nowIso = () => new Date().toISOString();

export function getPlayer(id: number) {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id) as Player | undefined;
}

export function players() {
  return db.prepare('SELECT * FROM players ORDER BY id').all() as Player[];
}

export function leaderboard() {
  return db
    .prepare('SELECT id, name, respect FROM players ORDER BY respect DESC, name ASC')
    .all() as { id: number; name: string; respect: number }[];
}

export function rankOf(playerId: number) {
  const board = leaderboard();
  return board.findIndex((p) => p.id === playerId) + 1;
}

// ---------- feed ----------

export function postFeed(kind: string, text: string, playerId: number | null = null) {
  db.prepare('INSERT INTO feed (kind, text, player_id) VALUES (?, ?, ?)').run(kind, text, playerId);
}

// ---------- Double Respect ----------

export function doubleRespectUntil(): string | null {
  const until = getSetting('double_until');
  if (!until || new Date(until) <= new Date()) return null;
  return until;
}

export function multiplier() {
  return doubleRespectUntil() ? 2 : 1;
}

export async function startDoubleRespect(minutes: number) {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  setSetting('double_until', until);
  postFeed('double', `DOUBLE RESPECT is live for ${minutes} minutes. Every mission pays 2x.`);
  await pushToAll({
    title: '2X DOUBLE RESPECT',
    body: `Missions pay double for ${minutes} min.`,
    tag: 'double',
  });
  return until;
}

export function stopDoubleRespect() {
  setSetting('double_until', '');
}

// ---------- Respect + achievements ----------

export async function addRespect(playerId: number, delta: number, reason: string) {
  db.prepare('UPDATE players SET respect = respect + ? WHERE id = ?').run(delta, playerId);
  db.prepare('INSERT INTO respect_log (player_id, delta, reason) VALUES (?, ?, ?)').run(playerId, delta, reason);
  await checkAchievements(playerId);
}

type AchievementDef = { key: string; title: string; description: string };

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_job', title: 'First Job', description: 'Complete your first mission.' },
  { key: 'hustler', title: 'Hustler', description: 'Complete 5 missions.' },
  { key: 'career_criminal', title: 'Career Criminal', description: 'Complete 10 missions.' },
  { key: 'big_shot', title: 'Big Shot', description: 'Reach 250 Respect.' },
  { key: 'untouchable', title: 'Untouchable', description: 'Reach 500 Respect.' },
  { key: 'bounty_hunter', title: 'Bounty Hunter', description: 'Collect a bounty.' },
  { key: 'loan_shark', title: 'Loan Shark', description: 'Put up 3 bounties.' },
  { key: 'night_shift', title: 'Night Shift', description: 'Get a mission approved between 1 and 5 AM.' },
  { key: 'double_trouble', title: 'Double Trouble', description: 'Earn Respect during Double Respect.' },
  { key: 'top_dog', title: 'Top Dog', description: 'Hold first place on the leaderboard.' },
  { key: 'kingpin', title: 'Kingpin', description: 'Finish the weekend in first place.' },
  { key: 'crowned', title: 'Heavy Is The Head', description: 'Receive the Crown.' },
  { key: 'kingmaker', title: 'Kingmaker', description: 'Hand the Crown to someone else.' },
];

export async function grantAchievement(playerId: number, key: string, title?: string, description?: string) {
  const def = ACHIEVEMENTS.find((a) => a.key === key);
  const t = title || def?.title || key;
  const d = description ?? def?.description ?? '';
  const res = db
    .prepare('INSERT OR IGNORE INTO achievements (player_id, key, title, description) VALUES (?, ?, ?, ?)')
    .run(playerId, key, t, d);
  if (res.changes === 0) return false;
  const p = getPlayer(playerId)!;
  postFeed('achievement', `${p.name} unlocked "${t}".`);
  // No push: achievements are a nice surprise next time they open the app, not an extra buzz.
  return true;
}


async function checkAchievements(playerId: number) {
  const p = getPlayer(playerId);
  if (!p) return;
  const done = (db.prepare("SELECT COUNT(*) n FROM claims WHERE player_id = ? AND status = 'approved'").get(playerId) as { n: number }).n;
  if (done >= 1) await grantAchievement(playerId, 'first_job');
  if (done >= 5) await grantAchievement(playerId, 'hustler');
  if (done >= 10) await grantAchievement(playerId, 'career_criminal');
  if (p.respect >= 250) await grantAchievement(playerId, 'big_shot');
  if (p.respect >= 500) await grantAchievement(playerId, 'untouchable');
  const posted = (db.prepare('SELECT COUNT(*) n FROM bounties WHERE issuer_id = ?').get(playerId) as { n: number }).n;
  if (posted >= 3) await grantAchievement(playerId, 'loan_shark');
  const board = leaderboard();
  if (board[0]?.id === playerId && p.respect > 0 && (board[1]?.respect ?? -1) < p.respect) {
    await grantAchievement(playerId, 'top_dog');
  }
}

// ---------- missions ----------

export type NewMission = {
  kind: 'side' | 'world' | 'mystery' | 'gm';
  title: string;
  description?: string;
  reward: number;
  targetPlayerId?: number | null;
  maxWinners?: number;
  expiresInMinutes?: number | null;
};

const KIND_LABEL: Record<string, string> = {
  side: 'SIDE MISSION',
  world: 'WORLD EVENT',
  mystery: 'MYSTERY EVENT',
  gm: 'NEW MISSION',
};

export async function createMission(m: NewMission, notify = true) {
  const expires = m.expiresInMinutes ? new Date(Date.now() + m.expiresInMinutes * 60_000).toISOString() : null;
  const res = db
    .prepare(
      `INSERT INTO missions (kind, title, description, reward, target_player_id, max_winners, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(m.kind, m.title, m.description || '', m.reward, m.targetPlayerId ?? null, m.maxWinners ?? 0, expires);
  const id = Number(res.lastInsertRowid);
  const label = KIND_LABEL[m.kind] || 'MISSION';
  const timeTxt = m.expiresInMinutes ? ` · ${m.expiresInMinutes} min` : '';
  if (m.targetPlayerId) {
    postFeed(m.kind, `${label} for you: ${m.title}`, m.targetPlayerId);
    if (notify)
      await pushToPlayer(m.targetPlayerId, {
        title: `${label} (TOP SECRET)`,
        body: `${m.title} · +${m.reward}${timeTxt}`,
        url: `/#/missions`,
        tag: `mission-${id}`,
      });
  } else {
    postFeed(m.kind, `${label}: ${m.title} (+${m.reward} Respect)`);
    if (notify)
      await pushToAll({ title: label, body: `${m.title} · +${m.reward}${timeTxt}`, url: `/#/missions`, tag: `mission-${id}` });
  }
  return id;
}

export function missionOpen(m: Mission) {
  if (m.closed) return false;
  if (m.expires_at && new Date(m.expires_at) <= new Date()) return false;
  return true;
}

export function visibleMissions(playerId: number) {
  const rows = db
    .prepare(
      `SELECT m.*, c.status AS my_status
       FROM missions m LEFT JOIN claims c ON c.mission_id = m.id AND c.player_id = ?
       WHERE m.target_player_id IS NULL OR m.target_player_id = ?
       ORDER BY m.id DESC LIMIT 100`,
    )
    .all(playerId, playerId) as (Mission & { my_status: string | null })[];
  return rows.map((m) => ({ ...m, open: missionOpen(m) }));
}

export async function submitClaim(playerId: number, missionId: number, note: string) {
  const m = db.prepare('SELECT * FROM missions WHERE id = ?').get(missionId) as Mission | undefined;
  if (!m) throw new Error('Mission not found');
  if (m.target_player_id && m.target_player_id !== playerId) throw new Error('Not your mission');
  if (!missionOpen(m)) throw new Error('Mission is closed');
  // Reward locked in at claim time, so Double Respect counts if you did it during the window.
  const amount = m.reward * multiplier();
  db.prepare('INSERT INTO claims (mission_id, player_id, note, awarded) VALUES (?, ?, ?, ?)').run(missionId, playerId, note, amount);
  const p = getPlayer(playerId)!;
  const gms = db.prepare('SELECT id FROM players WHERE is_gm = 1').all() as { id: number }[];
  for (const gm of gms) {
    await pushToPlayer(gm.id, { title: 'GM: claim to review', body: `${p.name}: ${m.title}`, url: '/#/gm', tag: 'gm-claims' });
  }
}

export async function reviewClaim(claimId: number, approve: boolean, reviewerId: number | null = null) {
  const c = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId) as
    | { id: number; mission_id: number; player_id: number; status: string; awarded: number; created_at: string }
    | undefined;
  if (!c || c.status !== 'pending') throw new Error('Claim not pending');
  const m = db.prepare('SELECT * FROM missions WHERE id = ?').get(c.mission_id) as Mission;
  db.prepare('UPDATE claims SET status = ? WHERE id = ?').run(approve ? 'approved' : 'rejected', claimId);
  const p = getPlayer(c.player_id)!;
  if (!approve) {
    await pushToPlayer(p.id, { title: 'MISSION FAILED', body: m.title, url: '/#/missions' });
    return;
  }
  await addRespect(p.id, c.awarded, `Mission: ${m.title}`);
  const self = reviewerId === p.id ? ' (approved own claim)' : reviewerId === null ? ' (auto-approved)' : '';
  postFeed('passed', `${p.name} completed "${m.title}" (+${c.awarded})${self}.`);
  await pushToPlayer(p.id, { title: 'MISSION COMPLETE', body: `+${c.awarded} · ${m.title}`, url: '/#/' });
  if (c.awarded > m.reward) await grantAchievement(p.id, 'double_trouble');
  const claimedAt = new Date(c.created_at);
  const h = localHour(claimedAt);
  if (h >= 1 && h < 5) await grantAchievement(p.id, 'night_shift');
  if (m.max_winners > 0) {
    const n = (db.prepare("SELECT COUNT(*) n FROM claims WHERE mission_id = ? AND status = 'approved'").get(m.id) as { n: number }).n;
    if (n >= m.max_winners) db.prepare('UPDATE missions SET closed = 1 WHERE id = ?').run(m.id);
  }
}

// ---------- bounties ----------
// A player puts their own Respect on the line. The issuer confirms who earned it.

export async function createBounty(issuerId: number, title: string, stake: number, targetId: number | null) {
  const issuer = getPlayer(issuerId)!;
  if (stake < 5) throw new Error('Minimum stake is 5 Respect');
  const held = (db.prepare("SELECT COALESCE(SUM(stake),0) s FROM bounties WHERE issuer_id = ? AND status IN ('open','claimed')").get(issuerId) as { s: number }).s;
  if (issuer.respect - held < stake) throw new Error(`You only have ${issuer.respect - held} Respect free to stake`);
  if (targetId === issuerId) throw new Error('You cannot put a bounty on yourself');
  const res = db.prepare('INSERT INTO bounties (issuer_id, target_id, title, stake) VALUES (?, ?, ?, ?)').run(issuerId, targetId, title, stake);
  const target = targetId ? getPlayer(targetId) : null;
  const who = target ? ` on ${target.name}` : '';
  postFeed('bounty', `${issuer.name} put a ${stake} Respect bounty${who}: ${title}`);
  await pushToAll({ title: `BOUNTY: ${stake} RESPECT`, body: `${issuer.name}${who}: ${title}`, url: '/#/bounties' }, issuerId);
  await checkAchievements(issuerId);
  return Number(res.lastInsertRowid);
}

type Bounty = { id: number; issuer_id: number; target_id: number | null; title: string; stake: number; status: string; claimant_id: number | null };

export async function claimBounty(playerId: number, bountyId: number, note: string) {
  const b = db.prepare('SELECT * FROM bounties WHERE id = ?').get(bountyId) as Bounty | undefined;
  if (!b || b.status !== 'open') throw new Error('Bounty is not open');
  if (b.issuer_id === playerId) throw new Error('You cannot claim your own bounty');
  if (b.target_id && b.target_id !== playerId) throw new Error('This bounty is for someone else');
  db.prepare("UPDATE bounties SET status = 'claimed', claimant_id = ?, claim_note = ? WHERE id = ?").run(playerId, note, bountyId);
  const p = getPlayer(playerId)!;
  await pushToPlayer(b.issuer_id, { title: 'BOUNTY CLAIMED', body: `${p.name}: ${b.title}`, url: '/#/bounties' });
}

export async function settleBounty(issuerId: number, bountyId: number, pay: boolean, asGm = false) {
  const b = db.prepare('SELECT * FROM bounties WHERE id = ?').get(bountyId) as Bounty | undefined;
  if (!b) throw new Error('Bounty not found');
  if (!asGm && b.issuer_id !== issuerId) throw new Error('Not your bounty');
  if (b.status !== 'claimed' || !b.claimant_id) throw new Error('Nothing to settle');
  if (!pay) {
    db.prepare("UPDATE bounties SET status = 'open', claimant_id = NULL, claim_note = '' WHERE id = ?").run(bountyId);
    await pushToPlayer(b.claimant_id, { title: 'BOUNTY DENIED', body: b.title, url: '/#/bounties' });
    return;
  }
  db.prepare("UPDATE bounties SET status = 'paid' WHERE id = ?").run(bountyId);
  const issuer = getPlayer(b.issuer_id)!;
  const hunter = getPlayer(b.claimant_id)!;
  await addRespect(issuer.id, -b.stake, `Paid bounty: ${b.title}`);
  await addRespect(hunter.id, b.stake, `Bounty from ${issuer.name}: ${b.title}`);
  postFeed('bounty', `${hunter.name} collected ${b.stake} Respect from ${issuer.name}: ${b.title}`);
  await pushToPlayer(hunter.id, { title: 'BOUNTY PAID', body: `+${b.stake} from ${issuer.name}`, url: '/#/' });
  await grantAchievement(hunter.id, 'bounty_hunter');
}

export function cancelBounty(issuerId: number, bountyId: number, asGm = false) {
  const b = db.prepare('SELECT * FROM bounties WHERE id = ?').get(bountyId) as Bounty | undefined;
  if (!b || (!asGm && b.issuer_id !== issuerId) || b.status !== 'open') throw new Error('Cannot cancel');
  db.prepare("UPDATE bounties SET status = 'cancelled' WHERE id = ?").run(bountyId);
}

export function listBounties() {
  return db
    .prepare(
      `SELECT b.*, i.name issuer_name, t.name target_name, c.name claimant_name
       FROM bounties b JOIN players i ON i.id = b.issuer_id
       LEFT JOIN players t ON t.id = b.target_id
       LEFT JOIN players c ON c.id = b.claimant_id
       WHERE b.status IN ('open','claimed') OR b.created_at > ?
       ORDER BY CASE b.status WHEN 'claimed' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, b.id DESC`,
    )
    .all(new Date(Date.now() - 24 * 3600_000).toISOString());
}

// ---------- broadcasts ----------

export async function worldEvent(title: string, body: string) {
  postFeed('world', `${title}: ${body}`);
  return pushToAll({ title: `WORLD EVENT: ${title}`, body, url: '/#/feed' });
}

export async function directMessage(playerId: number, title: string, body: string) {
  postFeed('mystery', `${title}: ${body}`, playerId);
  return pushToPlayer(playerId, { title, body, url: '/#/feed' });
}

// ---------- recap + final standings ----------

function standingsText() {
  return leaderboard()
    .map((p, i) => `${i + 1}. ${p.name} ${p.respect}`)
    .join('  ');
}

export async function dailyRecap() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const mvp = db
    .prepare(
      `SELECT p.name, SUM(r.delta) d FROM respect_log r JOIN players p ON p.id = r.player_id
       WHERE r.created_at > ? GROUP BY p.id ORDER BY d DESC LIMIT 1`,
    )
    .get(since) as { name: string; d: number } | undefined;
  const top3 = leaderboard()
    .slice(0, 3)
    .map((p, i) => `${i + 1}. ${p.name} ${p.respect}`)
    .join('  ');
  const body = `${mvp && mvp.d > 0 ? `MVP: ${mvp.name} +${mvp.d}. ` : ''}${top3}`;
  postFeed('recap', `Daily recap. ${body}`);
  await pushToAll({ title: 'YESTERDAY', body, url: '/#/leaderboard' });
  return body;
}

export async function finalStandings() {
  const board = leaderboard();
  const crown = crownState();
  const most = crown.counts[0];
  const crownTxt = crown.holder ? ` Crown ends with ${crown.holder.name}.` : '';
  const mostTxt = most ? ` Most crowned: ${most.name} (${most.n}x).` : '';
  const body = `Winner: ${board[0]?.name ?? 'nobody'}. ${standingsText()}.${crownTxt}${mostTxt}`;
  if (board[0]) await grantAchievement(board[0].id, 'kingpin');
  setSetting('final_at', nowIso());
  setSetting('sched_enabled', '0'); // game over: no more random drops or recaps
  postFeed('final', `FINAL STANDINGS. ${body}`);
  await pushToAll({ title: 'FINAL STANDINGS', body, url: '/#/leaderboard' });
  return body;
}

// ---------- the Crown ----------
// One crown. Anyone can hand it to anyone (not themselves, not the current holder) with a reason.
// Honorary: it gives no Respect, so it can't be farmed. Everyone gets a push.

type CrownRow = { id: number; from_id: number | null; to_id: number; reason: string; created_at: string; from_name: string | null; to_name: string };

export function crownState() {
  const history = db
    .prepare(
      `SELECT c.*, f.name from_name, t.name to_name FROM crown_log c
       LEFT JOIN players f ON f.id = c.from_id JOIN players t ON t.id = c.to_id
       ORDER BY c.id DESC LIMIT 100`,
    )
    .all() as CrownRow[];
  const counts = db
    .prepare('SELECT p.id, p.name, COUNT(*) n FROM crown_log c JOIN players p ON p.id = c.to_id GROUP BY p.id ORDER BY n DESC, p.name')
    .all() as { id: number; name: string; n: number }[];
  const last = history[0];
  return {
    holder: last ? { id: last.to_id, name: last.to_name, since: last.created_at, reason: last.reason, fromName: last.from_name } : null,
    history,
    counts,
  };
}

export const CROWN_BONUSES = [0, 10, 25, 50];

export async function passCrown(fromId: number | null, toId: number, reason: string, bonus = 0) {
  if (!CROWN_BONUSES.includes(bonus)) bonus = 0;
  const to = getPlayer(toId);
  if (!to) throw new Error('Pick someone to crown');
  if (fromId && fromId === toId) throw new Error('You cannot crown yourself. Nice try.');
  if (!reason.trim()) throw new Error('Say why they deserve it');
  const cooldown = Number(getSetting('crown_cooldown_min') ?? '15');
  if (fromId && cooldown > 0) {
    const last = db.prepare('SELECT created_at FROM crown_log WHERE from_id = ? ORDER BY id DESC LIMIT 1').get(fromId) as { created_at: string } | undefined;
    const wait = last ? cooldown - (Date.now() - new Date(last.created_at).getTime()) / 60_000 : 0;
    if (wait > 0) throw new Error(`You crowned someone recently. Wait ${Math.ceil(wait)} min.`);
  }
  const current = crownState().holder;
  if (current?.id === toId) throw new Error(`${to.name} already wears the Crown`);
  const from = fromId ? getPlayer(fromId) : null;
  db.prepare('INSERT INTO crown_log (from_id, to_id, reason, bonus) VALUES (?, ?, ?, ?)').run(fromId, toId, reason, bonus);
  // Optional Respect with the Crown. It is new Respect, not taken from the giver, and never to yourself (checked above).
  if (bonus) await addRespect(toId, bonus, `Crown from ${from ? from.name : 'the city'}: ${reason}`);
  const giver = from ? from.name : 'The city';
  const prev = current && current.id !== from?.id ? ` (taken from ${current.name})` : '';
  const plus = bonus ? ` +${bonus}` : '';
  postFeed('crown', `♛ ${giver} crowned ${to.name}${prev}${plus}: "${reason}"`);
  await pushToAll({ title: `♛ ${to.name.toUpperCase()}${plus}`, body: `${giver}: "${reason}"`, url: '/#/crown', tag: 'crown' });
  await grantAchievement(toId, 'crowned');
  if (from) await grantAchievement(from.id, 'kingmaker');
}

// ---------- start / pause ----------

export async function startGame() {
  if (getSetting('trip_started')) {
    setSetting('sched_enabled', '1');
    return false;
  }
  setSetting('trip_started', new Date().toISOString());
  setSetting('sched_enabled', '1');
  setSetting('next_drop_at', '');
  await worldEvent('GAME ON', 'The weekend has started. Respect is up for grabs.');
  return true;
}

// Wipe everything that happened in the game (for a clean start after testing).
// Keeps players, invite codes, logins, phones (push subscriptions), nametags, the mission pool and all settings.
export function resetGame() {
  db.transaction(() => {
    for (const t of ['claims', 'bounties', 'achievements', 'respect_log', 'feed', 'crown_log', 'missions']) db.exec(`DELETE FROM ${t}`);
    db.exec('UPDATE players SET respect = 0');
    db.exec('UPDATE mission_pool SET used = 0');
    db.prepare("DELETE FROM settings WHERE key IN ('trip_started', 'double_until', 'final_at', 'next_drop_at')").run();
    setSetting('sched_enabled', '0');
    setSetting('reset_epoch', String(Date.now())); // phones clear their caches and gag flags when this changes
  })();
}
