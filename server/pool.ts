import { db, getSetting, localHour, setSetting, tz } from './db.ts';

// Batch 2, added during the trip. Kept separate so it can be topped up into an existing pool once.
const SIDE_2: [string, string, number][] = [
  ['Tour Guide', 'Tell a stranger one fake fact about this town.', 30],
  ['Paparazzi', 'Photo of a crew member mid-sip, unnoticed.', 25],
  ['Local Legend', 'Get a local to name their favourite bar. Go there.', 40],
  ['Dress Code', 'Borrow a hat from a stranger for one photo.', 35],
  ['Polyglot', 'Order a round without speaking Norwegian or English.', 35],
  ['Hype Man', 'Get a stranger to cheer for the crew.', 30],
  ['Snack Run', 'Bring the crew a local snack nobody has tried.', 25],
  ['Arm Wrestle', 'Challenge a crew member. Loser buys.', 30],
  ['DJ Request', 'Get the venue to play a song you picked.', 40],
  ['Rush Hour', 'Get the crew from bar to bar in under 10 minutes.', 30],
  ['Napkin Signature', 'Get a staff member\'s autograph.', 30],
  ['Matchmaker', 'Get two strangers to clink glasses with each other.', 40],
  ['Street Performer', 'Earn a coin from a stranger. Any talent.', 50],
  ['Menu Roulette', 'Point at the menu blind. Eat or drink it.', 30],
  ['Historian', 'Find out the age of the bar you\'re in.', 25],
  ['Photobomb', 'Get into a stranger\'s group photo. With permission.', 30],
  ['Tab Detective', 'Find the oldest person in the bar. Toast them.', 35],
  ['Card Shark', 'Teach a stranger a card or drinking game.', 40],
  ['Speech!', 'Give a 30-second toast to the crew. No notes.', 30],
  ['Night Owl', 'Be the last of the crew standing tonight.', 40],
  ['Early Bird', 'First one up tomorrow. Proof with a photo of the sleepers.', 35],
  ['Local Dish', 'Eat something you can\'t pronounce.', 30],
  // Prague
  ['Na zdraví!', 'Lead a toast with "Na zdraví". Eye contact required.', 25],
  ['Pilsner Pilgrim', 'Drink a tank Pilsner (tankové pivo).', 25],
  ['Mlíko', 'Order a "mlíko" pour of beer. Down it.', 35],
  ['Beer Coaster', 'Steal-proof: get a coaster signed by the bartender.', 30],
  ['Becherovka Round', 'Buy the crew a round of Becherovka.', 40],
  ['Trdelník Test', 'Eat a trdelník. Rate it: tourist trap or legit.', 20],
  ['Smažák', 'Eat fried cheese (smažený sýr) after midnight.', 30],
  ['Charles Bridge', 'Crew photo on Charles Bridge. Touch the lucky statue.', 40],
  ['Clock Watch', 'Be at the Astronomical Clock when it strikes the hour.', 35],
  ['Děkuji', 'Thank 5 staff in Czech tonight.', 25],
];
const MYSTERY_2: [string, string, number][] = [
  ['Word Smuggler', 'Slip "banana republic" into a conversation twice.', 45],
  ['The Plant', 'Get a stranger to call a player by the wrong name.', 55],
  ['Toastmaster', 'Get someone else to propose a toast to you.', 50],
  ['Sleeper Cell', 'Start a crew-wide slow clap. Don\'t lead it.', 50],
  ['Echo', 'Repeat the last word someone says, 5 times. Undetected.', 45],
  ['Fake Birthday', 'Get staff to sing to a crew member.', 60],
  ['Name Drop', 'Get a stranger to say Christoffer\'s name.', 50],
  ['Puppet Master', 'Get Simen to order what you whisper. Secretly.', 55],
  ['Body Double', 'Get a stranger to wear your jacket for a photo.', 45],
  ['Wingman', 'Get a stranger to compliment Nikolai.', 50],
  // Prague
  ['Czech Mate', 'Get a local to teach the crew one Czech swear word.', 50],
  ['Pivo Whisper', 'Order beer for a crew member in Czech. They didn\'t ask.', 45],
  ['Dumpling Diplomat', 'Get a stranger to recommend a pub. Crew goes there.', 50],
  ['Bohemian Rhapsody', 'Get a bar to play Queen. Bohemia counts.', 50],
];

// Starter templates for random drops. The first lists work anywhere; batch 2 adds trip ideas and Prague ones.
// The Game Master can add or delete templates from the panel during the trip.
const SIDE: [string, string, number][] = [
  ['Street Portrait', 'Photo with a stranger in sunglasses.', 30],
  ['Local Intel', 'Learn a local word from a local. Use it.', 25],
  ['The Getaway Driver', 'Sort the next ride for the crew.', 20],
  ['Undercover', 'Order your next drink in a fake accent.', 30],
  ['Souvenir Run', 'Most ridiculous souvenir under 5 euros.', 35],
  ['Lookout', 'Photo of a dog, a statue and a red car.', 25],
  ['Smooth Talker', 'Order whatever the staff personally recommend.', 25],
  ['Group Shot', 'Whole crew photo, taken by a stranger.', 40],
  ['The Accountant', 'Guess the next bill within 10%.', 30],
  ['Wheelman', 'Lead the crew to the next spot. No maps.', 35],
  ['High Score', 'Win any game at the next place.', 40],
  ['Fixer', 'Get 3 of the crew to do something free.', 45],
  ['Cheers!', 'Learn how locals say cheers. Lead a toast with it.', 25],
  ['Bottoms Up', 'Find the cheapest beer in town. Prove it.', 30],
  ['Bartender\'s Choice', 'Let the bartender pick your next drink.', 25],
  ['New Friends', 'Clink glasses with a table of strangers.', 35],
  ['Shot Caller', 'Get the whole crew a round of something local.', 40],
  ...SIDE_2,
];
const MYSTERY: [string, string, number][] = [
  ['Mixologist', 'Get someone to order a drink you picked for them.', 45],
  ['Secret Agent', 'Make someone say "pineapple". Secretly.', 50],
  ['The Mole', 'Get a player to believe a harmless fake fact.', 50],
  ['Silent Partner', 'Compliment everyone within the hour. Act natural.', 40],
  ['Ghost', 'Steal someone\'s seat unnoticed.', 45],
  ['Inside Job', 'Get a drink bought for you. Never ask.', 60],
  ...MYSTERY_2,
];

type Template = [string, string, number];

// ---------- timing ----------
// Each template can have:
//   hours: when Autopilot may drop it, local time, "from-to" with "to" exclusive and wrapping past
//          midnight ("21-2" = 21:00-01:59). Empty = any time Autopilot is running.
//   lasts: how long it stays open: minutes ("180"), or "until H" (the next H:00, but always at
//          least an hour). Empty = the Autopilot default (sched_side_expiry, 90 min).
// Autopilot's own active hours (11-23 by default) still apply on top of "hours".
// [hours, lasts] per title. Titles not listed: any time, default length.
const TIMING: Record<string, [string, string]> = {
  // anywhere
  'Street Portrait': ['11-19', '120'],
  'Local Intel': ['', '120'],
  'Undercover': ['17-23', '120'],
  'Souvenir Run': ['11-19', '180'],
  'Lookout': ['11-19', '180'],
  'Smooth Talker': ['', '120'],
  'Group Shot': ['', '120'],
  'The Accountant': ['', '180'],
  'High Score': ['18-23', '180'],
  'Fixer': ['', '180'],
  'Cheers!': ['17-23', '120'],
  'Bottoms Up': ['17-23', 'until 3'],
  "Bartender's Choice": ['18-23', '120'],
  'New Friends': ['19-23', '180'],
  'Shot Caller': ['20-23', '180'],
  'Tour Guide': ['', '120'],
  'Paparazzi': ['', '120'],
  'Local Legend': ['16-22', '240'],
  'Dress Code': ['', '120'],
  'Polyglot': ['16-23', '180'],
  'Hype Man': ['18-23', '180'],
  'Snack Run': ['11-20', '180'],
  'Arm Wrestle': ['18-23', '180'],
  'DJ Request': ['20-23', 'until 3'],
  'Rush Hour': ['19-23', '180'],
  'Napkin Signature': ['18-23', '180'],
  'Matchmaker': ['19-23', '180'],
  'Street Performer': ['12-20', '180'],
  'Menu Roulette': ['', '180'],
  'Historian': ['17-23', '180'],
  'Photobomb': ['11-20', '180'],
  'Tab Detective': ['19-23', '180'],
  'Card Shark': ['19-23', '180'],
  'Speech!': ['18-23', '120'],
  'Night Owl': ['21-23', 'until 6'],
  'Early Bird': ['21-23', 'until 12'],
  'Local Dish': ['', '240'],
  // Prague
  'Na zdraví!': ['17-23', '120'],
  'Pilsner Pilgrim': ['', '240'],
  'Mlíko': ['17-23', '180'],
  'Beer Coaster': ['18-23', '180'],
  'Becherovka Round': ['19-23', '180'],
  'Trdelník Test': ['11-19', '240'],
  'Smažák': ['21-23', 'until 4'],
  'Charles Bridge': ['11-20', '240'],
  'Clock Watch': ['11-20', '120'],
  'Děkuji': ['17-23', 'until 3'],
  // mystery
  'Mixologist': ['18-23', '180'],
  'Secret Agent': ['', '240'],
  'The Mole': ['', '240'],
  'Silent Partner': ['', '60'],
  'Ghost': ['', '120'],
  'Inside Job': ['19-23', 'until 3'],
  'Word Smuggler': ['', '240'],
  'The Plant': ['18-23', '240'],
  'Toastmaster': ['18-23', 'until 3'],
  'Sleeper Cell': ['18-23', '240'],
  'Echo': ['', '120'],
  'Fake Birthday': ['18-23', '240'],
  'Name Drop': ['18-23', '240'],
  'Puppet Master': ['17-23', '180'],
  'Body Double': ['', '180'],
  'Wingman': ['18-23', '240'],
  'Czech Mate': ['18-23', '240'],
  'Pivo Whisper': ['17-23', '180'],
  'Dumpling Diplomat': ['13-21', '240'],
  'Bohemian Rhapsody': ['20-23', 'until 3'],
};

// Normalises GM/paste input. Returns null for "any"/empty, a canonical string, or throws.
export function parseHours(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'any' || s === '-') return null;
  const m = s.match(/^(\d{1,2})(?::00)?\s*[-–]\s*(\d{1,2})(?::00)?$/);
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 24 || Number(m[1]) % 24 === Number(m[2]) % 24)
    throw new Error(`Hours "${s}" should look like 18-23 (or "any")`);
  return `${Number(m[1]) % 24}-${Number(m[2]) % 24}`;
}

export function parseLasts(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'default' || s === '-') return null;
  let m = s.match(/^(?:until|till|to)\s+(\d{1,2})(?::00)?$/);
  if (m && Number(m[1]) <= 24) return `until ${Number(m[1]) % 24}`;
  m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hours?|m|min|minutes?)?$/);
  if (m) {
    const min = Math.round(Number(m[1]) * (m[2]?.startsWith('h') ? 60 : 1));
    if (min >= 10 && min <= 48 * 60) return String(min);
  }
  throw new Error(`Duration "${s}" should be minutes (180), hours (3h) or "until 4"`);
}

export function inWindow(hours: string | null, h = localHour()) {
  if (!hours) return true;
  const [from, to] = hours.split('-').map(Number);
  return from < to ? h >= from && h < to : h >= from || h < to;
}

// When a mission dropped now should close
export function expiryFor(lasts: string | null, defaultMin: number, now = new Date()): Date {
  const until = lasts?.match(/^until (\d+)$/);
  if (until) {
    // the next H:00 local time; if that's under an hour away, give it the hour anyway
    const t = new Date(now);
    t.setUTCMinutes(0, 0, 0);
    for (let i = 0; i < 26; i++) {
      t.setTime(t.getTime() + 3600_000);
      if (localHour(t) === Number(until[1])) return new Date(Math.max(t.getTime(), now.getTime() + 3600_000));
    }
  }
  return new Date(now.getTime() + (lasts && !until ? Number(lasts) : defaultMin) * 60_000);
}

// Short "· 90 min" / "· until 03:00" text for pushes
export function expiryLabel(expires: Date, now = new Date()) {
  const min = Math.round((expires.getTime() - now.getTime()) / 60_000);
  if (min <= 180) return `${min} min`;
  return `until ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz() }).format(expires)}`;
}

const ins = () => db.prepare('INSERT INTO mission_pool (kind, title, description, reward, hours, lasts) VALUES (?, ?, ?, ?, ?, ?)');
const timing = (title: string): [string | null, string | null] => {
  const t = TIMING[title];
  return t ? [parseHours(t[0]), parseLasts(t[1])] : [null, null];
};

export function seedPoolIfEmpty() {
  const n = (db.prepare('SELECT COUNT(*) n FROM mission_pool').get() as { n: number }).n;
  if (n) {
    topUp('pool_batch_2', SIDE_2, MYSTERY_2);
    applyTiming('pool_timing_1');
    return;
  }
  const stmt = ins();
  for (const [t, d, r] of SIDE) stmt.run('side', t, d, r, ...timing(t));
  for (const [t, d, r] of MYSTERY) stmt.run('mystery', t, d, r, ...timing(t));
  setSetting('pool_batch_2', '1');
  setSetting('pool_timing_1', '1');
}

// Adds a batch of new templates to a pool that already exists (the live server), once.
// Runs a single time per batch key, so templates the GM deletes afterwards stay deleted.
function topUp(key: string, side: Template[], mystery: Template[]) {
  if (getSetting(key)) return;
  const has = db.prepare('SELECT 1 FROM mission_pool WHERE title = ?');
  const stmt = ins();
  db.transaction(() => {
    for (const [kind, list] of [['side', side], ['mystery', mystery]] as const)
      for (const [t, d, r] of list) if (!has.get(t)) stmt.run(kind, t, d, r, ...timing(t));
    setSetting(key, '1');
  })();
}

// Gives existing templates their default timing, once. Only fills templates that have none,
// so anything the GM has already set is left alone.
function applyTiming(key: string) {
  if (getSetting(key)) return;
  const upd = db.prepare('UPDATE mission_pool SET hours = ?, lasts = ? WHERE title = ? AND hours IS NULL AND lasts IS NULL');
  db.transaction(() => {
    for (const title of Object.keys(TIMING)) upd.run(...timing(title), title);
    setSetting(key, '1');
  })();
}

// ---------- bulk add from the GM panel ----------
// Paste one mission per line, in either format (the last two fields are optional):
//   Title | Briefing | 30 | 18-23 | 180
//   ['Title', 'Briefing', 30, '18-23', 'until 3'],
// Reward defaults to 30. Hours = when it may drop ("any" or empty = any time),
// duration = minutes, "3h" or "until 3" (empty = default).
// A line that says "side" or "mystery" on its own, or a comment like "// add to MYSTERY",
// switches the kind for the lines below it. Blank lines are ignored.

type Parsed = { kind: 'side' | 'mystery'; title: string; description: string; reward: number; hours: string | null; lasts: string | null };

const unescape = (s: string) => s.replace(/\\(.)/g, '$1');

// ['a', "b", 30, 'x', 180], -> ['a', 'b', 30, 'x', 180]; null if it isn't a row like that
function parseJsRow(line: string): (string | number)[] | null {
  const m = line.match(/^\[(.*)\]\s*,?$/);
  if (!m) return null;
  const out: (string | number)[] = [];
  const re = /\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|(\d+))\s*(,|$)/y;
  let body = m[1].trim().replace(/,$/, '');
  re.lastIndex = 0;
  while (re.lastIndex < body.length) {
    const t = re.exec(body);
    if (!t) return null;
    out.push(t[3] !== undefined ? Number(t[3]) : unescape(t[1] ?? t[2]));
    if (!t[4]) break;
  }
  return re.lastIndex >= body.length ? out : null;
}

export function parsePoolText(text: string, kind: 'side' | 'mystery'): { rows: Parsed[]; errors: string[] } {
  const rows: Parsed[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (/^(\/\/|#)/.test(line) || /^(side|mystery)\b[\s:]*$/i.test(line)) {
      if (/mystery/i.test(line)) kind = 'mystery';
      else if (/side/i.test(line)) kind = 'side';
      return;
    }
    const bad = (msg: string) => void errors.push(`line ${i + 1}: ${msg}`);
    let f: (string | number | undefined)[];
    const js = line.startsWith('[') ? parseJsRow(line) : null;
    if (js) {
      if (js.length < 3 || js.length > 5 || typeof js[0] !== 'string' || typeof js[1] !== 'string' || typeof js[2] !== 'number')
        return bad("use ['Title', 'Briefing', 30]");
      f = js;
    } else if (line.includes('|')) {
      f = line.split('|').map((p) => p.trim());
      if (f.length > 5) return bad('use Title | Briefing | 30 | 18-23 | 180');
      if (f[2] !== undefined && f[2] !== '' && !/^\d+$/.test(String(f[2]))) return bad('reward must be a number');
      f[2] = f[2] ? Number(f[2]) : 30;
    } else {
      return bad('not a mission');
    }
    const [title, description = '', reward] = [String(f[0] ?? ''), String(f[1] ?? ''), Number(f[2])];
    if (!title) return bad('missing title');
    if (reward < 1 || reward > 1000) return bad('reward must be 1-1000');
    let hours: string | null, lasts: string | null;
    try {
      hours = parseHours(f[3]);
      lasts = parseLasts(f[4]);
    } catch (e: any) {
      return bad(e.message);
    }
    rows.push({ kind, title: title.slice(0, 200), description: description.slice(0, 1000), reward, hours, lasts });
  });
  return { rows, errors };
}

// All or nothing: if any line is wrong, nothing is added, so the GM can fix the paste and retry.
export function addPoolText(text: string, kind: 'side' | 'mystery') {
  const { rows, errors } = parsePoolText(text, kind);
  if (errors.length) throw new Error(`Nothing added. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}`);
  if (!rows.length) throw new Error('Nothing to add');
  const has = db.prepare('SELECT 1 FROM mission_pool WHERE title = ?');
  const stmt = ins();
  const skipped: string[] = [];
  let side = 0;
  let mystery = 0;
  db.transaction(() => {
    for (const r of rows) {
      if (has.get(r.title)) {
        skipped.push(r.title);
        continue;
      }
      stmt.run(r.kind, r.title, r.description, r.reward, r.hours, r.lasts);
      r.kind === 'side' ? side++ : mystery++;
    }
  })();
  return { side, mystery, skipped };
}

// GM edits one template's timing
export function setPoolTiming(id: number, hours: unknown, lasts: unknown) {
  const res = db.prepare('UPDATE mission_pool SET hours = ?, lasts = ? WHERE id = ?').run(parseHours(hours), parseLasts(lasts), id);
  if (!res.changes) throw new Error('Template not found');
}
