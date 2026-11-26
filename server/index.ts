import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { backupNow, db, getSetting, setSetting, tz, type Player } from './db.ts';
import * as game from './game.ts';
import { pushToAll, pushToPlayer, saveSubscription, vapidPublicKey } from './push.ts';
import { randomDrop, resetDropTimer, sched, SCHED_DEFAULTS, startScheduler, vetoMission } from './scheduler.ts';
import { seedPoolIfEmpty } from './pool.ts';
import { seedPlayers } from './seedlib.ts';
import { aliasesOf, applyDefaultAliases, parseAliases } from './aliases.ts';
import QRCode from 'qrcode';

seedPoolIfEmpty();

// First boot on a fresh server: create the players from SEED_PLAYERS (comma separated, * = GM, ~ = mix-up pair)
if (process.env.SEED_PLAYERS && !(db.prepare('SELECT COUNT(*) n FROM players').get() as { n: number }).n) {
  seedPlayers(process.env.SEED_PLAYERS.split(',').map((x) => x.trim()).filter(Boolean), process.env.GM_CODE || '');
}
applyDefaultAliases();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

declare global {
  namespace Express {
    interface Request {
      player?: Player;
    }
  }
}

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const int = (v: unknown, def = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : def;
};

function auth(req: Request, res: Response, next: NextFunction) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const player = token ? (db.prepare('SELECT * FROM players WHERE token = ?').get(token) as Player | undefined) : undefined;
  if (!player) return void res.status(401).json({ error: 'Not logged in' });
  req.player = player;
  db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(new Date().toISOString(), player.id);
  next();
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function gm(req: Request, res: Response, next: NextFunction) {
  const pin = String(req.headers['x-gm-pin'] || '');
  if (!req.player?.is_gm || !config.gmPin || !safeEqual(pin, config.gmPin)) {
    return void res.status(404).json({ error: 'Not found' }); // stays hidden
  }
  next();
}

// Very small brute-force guard for the invite code login
const attempts = new Map<string, { n: number; until: number }>();
function loginGuard(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'x';
  const a = attempts.get(key);
  if (a && a.n >= 10 && a.until > Date.now()) return void res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
  next();
}

// ---------- public ----------

// For an uptime monitor (e.g. UptimeRobot): 200 when the server and database answer
app.get('/api/health', (_req, res) => {
  const n = (db.prepare('SELECT COUNT(*) n FROM players').get() as { n: number }).n;
  res.json({ ok: true, players: n, time: new Date().toISOString(), backup: backupUrl() || undefined });
});

// Backup address written by deploy/ensure-caddy.sh (e.g. https://1-2-3-4.sslip.io), for when a carrier blocks the main domain
function backupUrl() {
  try {
    return fs.readFileSync(path.join(config.dataDir, 'backup-url'), 'utf8').trim();
  } catch {
    return '';
  }
}

app.get('/api/config', (_req, res) => {
  res.json({ appName: config.appName, vapidPublicKey, scamGag: (getSetting('scam_gag') ?? '1') === '1', resetEpoch: getSetting('reset_epoch') || '' });
});

function noteFailedCode(req: Request) {
  const key = req.ip || 'x';
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n = a.until < Date.now() ? 1 : a.n + 1;
  a.until = Date.now() + 5 * 60_000;
  attempts.set(key, a);
}

function playerByCode(raw: unknown) {
  const code = str(raw, 40).toUpperCase().replace(/\s+/g, '');
  return db.prepare('SELECT * FROM players WHERE UPPER(code) = ?').get(code) as Player | undefined;
}

// The "mistaken identity" pair: each gets greeted as the other one first
function twinOf(playerId: number) {
  const a = Number(getSetting('twin_a') || 0);
  const b = Number(getSetting('twin_b') || 0);
  if (!a || !b || a === b) return null;
  const otherId = playerId === a ? b : playerId === b ? a : 0;
  return otherId ? game.getPlayer(otherId) || null : null;
}

// Personal QR links (/?invite=CODE) ask what intro to play before anyone is logged in
app.get('/api/intro/:code', loginGuard, (req, res) => {
  const p = playerByCode(req.params.code);
  if (!p) {
    noteFailedCode(req);
    return void res.status(404).json({ error: 'Unknown invite' });
  }
  const twin = twinOf(p.id);
  res.json({
    name: p.name,
    code: p.code,
    scamGag: (getSetting('scam_gag') ?? '1') === '1',
    decoy: twin ? { name: twin.name } : null,
  });
});

// Gag results are reported with the invite code, because on iPhone the home-screen app
// does not share storage with Safari, where the gags play.
app.post('/api/intro/:code/gag', loginGuard, async (req, res) => {
  const p = playerByCode(req.params.code);
  if (!p) {
    noteFailedCode(req);
    return void res.status(404).json({ error: 'Unknown invite' });
  }
  if (req.body.gag === 'scam') {
    await game.grantAchievement(p.id, 'easy_mark', 'Easy Mark', 'Tried to claim 1,000,000 Respect from a very real bank.');
  } else if (req.body.gag === 'twin') {
    const twin = twinOf(p.id);
    if (twin) await game.grantAchievement(p.id, 'mistaken_identity', 'Mistaken Identity', `Was welcomed as ${twin.name}. Again.`);
  }
  res.json({ ok: true });
});

app.post('/api/login', loginGuard, (req, res) => {
  const player = playerByCode(req.body.code);
  if (!player) {
    noteFailedCode(req);
    return void res.status(401).json({ error: 'That code is not on the list.' });
  }
  // Reuse an existing token so Safari and the home-screen app can both stay logged in
  let token = player.token;
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    db.prepare('UPDATE players SET token = ?, joined_at = COALESCE(joined_at, ?) WHERE id = ?').run(token, new Date().toISOString(), player.id);
    game.postFeed('join', `${player.name} arrived in the city.`);
  }
  res.json({ token, name: player.name });
});

// ---------- player ----------

app.use('/api', (req, res, next) => (req.path.startsWith('/gm') || req.path.startsWith('/intro/') ? next() : auth(req, res, next)));

app.get('/api/me', (req, res) => {
  const p = req.player!;
  const achievements = db.prepare('SELECT key, title, description, created_at FROM achievements WHERE player_id = ? ORDER BY id DESC').all(p.id);
  const log = db.prepare('SELECT delta, reason, created_at FROM respect_log WHERE player_id = ? ORDER BY id DESC LIMIT 30').all(p.id);
  const subs = (db.prepare('SELECT COUNT(*) n FROM push_subs WHERE player_id = ?').get(p.id) as { n: number }).n;
  res.json({
    id: p.id,
    name: p.name,
    aliases: aliasesOf(p),
    respect: p.respect,
    rank: game.rankOf(p.id),
    players: game.players().length,
    isGm: !!p.is_gm,
    pushDevices: subs,
    doubleUntil: game.doubleRespectUntil(),
    finalAt: getSetting('final_at') || null,
    crown: game.crownState().holder,
    achievements,
    allAchievements: game.ACHIEVEMENTS,
    log,
  });
});

app.post('/api/push/subscribe', (req, res) => {
  const sub = req.body.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return void res.status(400).json({ error: 'Bad subscription' });
  saveSubscription(req.player!.id, sub);
  res.json({ ok: true });
});

app.post('/api/push/test', async (req, res) => {
  const r = await pushToPlayer(req.player!.id, {
    title: `${config.appName}`,
    body: 'Radio check. If you can read this, the city can reach you.',
    tag: 'test',
  });
  res.json(r);
});

// The first-open scam gag: players who clicked "claim" earn a joke achievement
app.post('/api/gag', async (req, res) => {
  await game.grantAchievement(req.player!.id, 'easy_mark', 'Easy Mark', 'Tried to claim 1,000,000 Respect from a very real bank.');
  res.json({ ok: true });
});

app.get('/api/missions', (req, res) => {
  res.json(game.visibleMissions(req.player!.id));
});

app.post('/api/missions/:id/claim', async (req, res) => {
  res.json(await game.submitClaim(req.player!.id, int(req.params.id), str(req.body.note)));
});

app.get('/api/crown', (_req, res) => {
  res.json(game.crownState());
});

app.post('/api/crown', async (req, res) => {
  await game.passCrown(req.player!.id, int(req.body.toId), str(req.body.reason, 200), int(req.body.bonus));
  res.json({ ok: true });
});

app.get('/api/leaderboard', (_req, res) => {
  res.json(game.leaderboard());
});

app.get('/api/players', (_req, res) => {
  res.json(game.players().map((p) => ({ id: p.id, name: p.name })));
});

app.get('/api/bounties', (_req, res) => {
  res.json(game.listBounties());
});

app.post('/api/bounties', async (req, res) => {
  const target = req.body.targetId ? int(req.body.targetId) : null;
  const id = await game.createBounty(req.player!.id, str(req.body.title, 200), int(req.body.stake), target);
  res.json({ id });
});

app.post('/api/bounties/:id/claim', async (req, res) => {
  await game.claimBounty(req.player!.id, int(req.params.id), str(req.body.note));
  res.json({ ok: true });
});

app.post('/api/bounties/:id/settle', async (req, res) => {
  await game.settleBounty(req.player!.id, int(req.params.id), !!req.body.pay);
  res.json({ ok: true });
});

app.post('/api/bounties/:id/cancel', (req, res) => {
  game.cancelBounty(req.player!.id, int(req.params.id));
  res.json({ ok: true });
});

app.get('/api/feed', (req, res) => {
  res.json(
    db
      .prepare('SELECT id, kind, text, player_id IS NOT NULL AS private, created_at FROM feed WHERE player_id IS NULL OR player_id = ? ORDER BY id DESC LIMIT 100')
      .all(req.player!.id),
  );
});

// ---------- hidden Game Master ----------

const gmRouter = express.Router();
gmRouter.use(auth, gm);

gmRouter.post('/verify', (_req, res) => res.json({ ok: true }));

gmRouter.get('/state', (_req, res) => {
  const settings: Record<string, string> = {};
  for (const k of Object.keys(SCHED_DEFAULTS)) settings[k] = sched(k);
  settings.side_max_winners = getSetting('side_max_winners') || '1';
  settings.twin_a = getSetting('twin_a') || '';
  settings.twin_b = getSetting('twin_b') || '';
  settings.scam_gag = getSetting('scam_gag') ?? '1';
  settings.tz = tz();
  settings.auto_approve_min = getSetting('auto_approve_min') || '0';
  settings.honor_system = getSetting('honor_system') ?? '1';
  settings.crown_cooldown_min = getSetting('crown_cooldown_min') ?? '15';
  res.json({
    players: db
      .prepare(
        `SELECT p.id, p.name, p.code, p.is_gm, p.respect, p.joined_at, p.last_seen, p.aliases,
         (SELECT COUNT(*) FROM push_subs s WHERE s.player_id = p.id) devices
         FROM players p ORDER BY p.id`,
      )
      .all(),
    claims: db
      .prepare(
        `SELECT c.id, c.note, c.awarded, c.created_at, p.name player, m.title mission
         FROM claims c JOIN players p ON p.id = c.player_id JOIN missions m ON m.id = c.mission_id
         WHERE c.status = 'pending' ORDER BY c.id`,
      )
      .all(),
    done: db
      .prepare(
        `SELECT c.id, c.awarded, c.created_at, p.name player, m.title mission
         FROM claims c JOIN players p ON p.id = c.player_id JOIN missions m ON m.id = c.mission_id
         WHERE c.status = 'approved' ORDER BY c.id DESC LIMIT 12`,
      )
      .all(),
    bounties: game.listBounties(),
    missions: db
      .prepare(
        `SELECT m.*, t.name target_name,
         (SELECT COUNT(*) FROM claims c WHERE c.mission_id = m.id AND c.status = 'approved') winners
         FROM missions m LEFT JOIN players t ON t.id = m.target_player_id ORDER BY m.id DESC LIMIT 50`,
      )
      .all()
      .map((m: any) => ({ ...m, open: game.missionOpen(m) })),
    pool: db.prepare('SELECT * FROM mission_pool ORDER BY kind, used, id').all(),
    settings,
    nextDropAt: getSetting('next_drop_at') || null,
    tripStarted: getSetting('trip_started') || null,
    baseUrl: `${_req.protocol}://${_req.get('host')}`,
    backupUrl: backupUrl(),
    doubleUntil: game.doubleRespectUntil(),
    finalAt: getSetting('final_at') || null,
  });
});

gmRouter.post('/missions', async (req, res) => {
  const kind = ['side', 'world', 'mystery', 'gm'].includes(req.body.kind) ? req.body.kind : 'gm';
  const id = await game.createMission(
    {
      kind,
      title: str(req.body.title, 200),
      description: str(req.body.description, 1000),
      reward: int(req.body.reward, 25),
      targetPlayerId: req.body.targetPlayerId ? int(req.body.targetPlayerId) : null,
      maxWinners: int(req.body.maxWinners, 0),
      expiresInMinutes: req.body.expiresInMinutes ? int(req.body.expiresInMinutes) : null,
    },
    req.body.notify !== false,
  );
  res.json({ id });
});

gmRouter.post('/missions/:id/close', (req, res) => {
  db.prepare('UPDATE missions SET closed = 1 WHERE id = ?').run(int(req.params.id));
  res.json({ ok: true });
});

gmRouter.post('/missions/:id/veto', async (req, res) => {
  const newId = await vetoMission(int(req.params.id));
  const m = newId ? (db.prepare('SELECT title FROM missions WHERE id = ?').get(newId) as { title: string }) : null;
  res.json({ ok: true, text: m ? `Swapped for: ${m.title}` : 'Scrapped. The pool is empty, so nothing was swapped in.' });
});

gmRouter.post('/pool/:id/restore', (req, res) => {
  db.prepare('UPDATE mission_pool SET vetoed = 0 WHERE id = ?').run(int(req.params.id));
  res.json({ ok: true });
});

gmRouter.post('/claims/:id/undo', async (req, res) => {
  await game.revokeClaim(int(req.params.id));
  res.json({ ok: true, text: 'Undone. Points taken back.' });
});

gmRouter.post('/claims/:id', async (req, res) => {
  await game.reviewClaim(int(req.params.id), !!req.body.approve, req.player!.id);
  res.json({ ok: true });
});

gmRouter.post('/bounties/:id/settle', async (req, res) => {
  await game.settleBounty(0, int(req.params.id), !!req.body.pay, true);
  res.json({ ok: true });
});

gmRouter.post('/bounties/:id/cancel', (req, res) => {
  game.cancelBounty(0, int(req.params.id), true);
  res.json({ ok: true });
});

gmRouter.post('/world', async (req, res) => {
  res.json(await game.worldEvent(str(req.body.title, 100), str(req.body.body, 500)));
});

gmRouter.post('/dm', async (req, res) => {
  res.json(await game.directMessage(int(req.body.playerId), str(req.body.title, 100) || 'INCOMING CALL', str(req.body.body, 500)));
});

gmRouter.post('/double', async (req, res) => {
  res.json({ until: await game.startDoubleRespect(Math.max(1, int(req.body.minutes, 30))) });
});

gmRouter.delete('/double', (_req, res) => {
  game.stopDoubleRespect();
  res.json({ ok: true });
});

gmRouter.post('/respect', async (req, res) => {
  const delta = int(req.body.delta);
  const reason = str(req.body.reason, 200) || 'Game Master';
  const pid = int(req.body.playerId);
  if (pid === req.player!.id && delta > 0) throw new Error('You cannot give Respect to yourself');
  await game.addRespect(pid, delta, reason);
  if (req.body.notify !== false) {
    await pushToPlayer(pid, { title: delta >= 0 ? `+${delta} RESPECT` : `${delta} RESPECT`, body: reason, url: '/#/me' });
  }
  res.json({ ok: true });
});

gmRouter.post('/achievement', async (req, res) => {
  const title = str(req.body.title, 100);
  const key = 'gm_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const ok = await game.grantAchievement(int(req.body.playerId), key, title, str(req.body.description, 300));
  res.json({ ok });
});

gmRouter.post('/crown', async (req, res) => {
  await game.passCrown(null, int(req.body.toId), str(req.body.reason, 200), int(req.body.bonus));
  res.json({ ok: true });
});

gmRouter.post('/recap', async (_req, res) => res.json({ text: await game.dailyRecap() }));
gmRouter.post('/final', async (_req, res) => res.json({ text: await game.finalStandings() }));
gmRouter.post('/drop', async (_req, res) => res.json({ id: await randomDrop() }));

gmRouter.post('/settings', (req, res) => {
  const allowed = [...Object.keys(SCHED_DEFAULTS), 'side_max_winners', 'twin_a', 'twin_b', 'scam_gag', 'tz', 'auto_approve_min', 'crown_cooldown_min', 'honor_system'];
  if (req.body.tz) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: String(req.body.tz) });
    } catch {
      throw new Error('Unknown time zone. Use a name like Europe/Lisbon.');
    }
  }
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) setSetting(k, str(v, 100));
  }
  if ('sched_enabled' in req.body || 'sched_min_gap' in req.body || 'sched_max_gap' in req.body) resetDropTimer();
  res.json({ ok: true });
});

gmRouter.post('/pool', (req, res) => {
  const kind = req.body.kind === 'mystery' ? 'mystery' : 'side';
  db.prepare('INSERT INTO mission_pool (kind, title, description, reward) VALUES (?, ?, ?, ?)').run(
    kind,
    str(req.body.title, 200),
    str(req.body.description, 1000),
    int(req.body.reward, 25),
  );
  res.json({ ok: true });
});

gmRouter.delete('/pool/:id', (req, res) => {
  db.prepare('DELETE FROM mission_pool WHERE id = ?').run(int(req.params.id));
  res.json({ ok: true });
});

gmRouter.post('/test-push', async (req, res) => {
  const payload = { title: 'RADIO CHECK', body: 'Testing the city broadcast system. Nothing to see here.', tag: 'test' };
  res.json(req.body.playerId ? await pushToPlayer(int(req.body.playerId), payload) : await pushToAll(payload));
});

// Printable QR cards. The two look-alikes get cards labeled with the OTHER one's name.
gmRouter.get('/qr', async (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const cards = [];
  for (const p of game.players()) {
    const url = `${base}/?invite=${encodeURIComponent(p.code)}`;
    const twin = twinOf(p.id);
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
    cards.push({ id: p.id, name: p.name, url, svg }); // own name on every card: swaps can't break anything
  }
  res.json(cards);
});

gmRouter.post('/start', async (_req, res) => {
  res.json({ started: await game.startGame() });
});

gmRouter.post('/reset', async (req, res) => {
  if (req.body.confirm !== 'RESET') return void res.status(400).json({ error: 'Type RESET to confirm.' });
  const file = path.basename(await backupNow()); // safety copy, just in case
  game.resetGame();
  resetDropTimer();
  res.json({ ok: true, backup: file });
});

gmRouter.post('/pause', (req, res) => {
  setSetting('sched_enabled', req.body.paused ? '0' : '1');
  if (!req.body.paused) resetDropTimer();
  res.json({ ok: true });
});

gmRouter.post('/backup', async (_req, res) => {
  res.json({ file: path.basename(await backupNow()) });
});

// Lost or leaked card: new code, old logins and phones are signed out
gmRouter.post('/players/:id/reissue', (req, res) => {
  const id = int(req.params.id);
  const p = game.getPlayer(id);
  if (!p) throw new Error('No such player');
  const word = p.code.split('-')[0] || 'NEW';
  let code = '';
  do code = `${word}-${crypto.randomInt(1000, 10000)}`;
  while (db.prepare('SELECT 1 FROM players WHERE code = ?').get(code));
  db.prepare('UPDATE players SET code = ?, token = NULL WHERE id = ?').run(code, id);
  db.prepare('DELETE FROM push_subs WHERE player_id = ?').run(id);
  res.json({ code });
});

gmRouter.post('/players/:id', (req, res) => {
  const name = str(req.body.name, 40);
  if (name) db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name, int(req.params.id));
  if ('aliases' in req.body) db.prepare('UPDATE players SET aliases = ? WHERE id = ?').run(JSON.stringify(parseAliases(req.body.aliases)), int(req.params.id));
  if (req.body.resetLogin) {
    // sign out everywhere and drop their phones' alerts, but keep the same code (printed cards stay valid)
    db.prepare('UPDATE players SET token = NULL, last_seen = NULL WHERE id = ?').run(int(req.params.id));
    db.prepare('DELETE FROM push_subs WHERE player_id = ?').run(int(req.params.id));
  }
  res.json({ ok: true });
});

app.use('/api/gm', gmRouter);

app.use('/api', (_req, res) => void res.status(404).json({ error: 'Not found' }));

// ---------- static frontend ----------

const dist = path.resolve('web/dist');
if (fs.existsSync(dist)) {
  app.use(
    express.static(dist, {
      setHeaders(res, file) {
        // never cache the service worker or the HTML, so updates reach phones
        if (file.endsWith('sw.js') || file.endsWith('.html') || file.endsWith('.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') return void res.status(400).json({ error: 'Already submitted' });
  res.status(400).json({ error: err?.message || 'Something went wrong' });
});

app.listen(config.port, () => {
  console.log(`[server] ${config.appName} on http://localhost:${config.port}`);
  const n = game.players().length;
  if (!n) console.log('[server] No players yet. Run: npm run seed -- "Thor*" Alex Ben Chris Dan Erik  (* marks the Game Master)');
  startScheduler();
});

