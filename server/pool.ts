import { db, getSetting, setSetting } from './db.ts';

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
  ['Napkin Signature', 'Get a staff member\'s autograph.', 30],  ['Matchmaker', 'Get two strangers to clink glasses with each other.', 40],
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
];
const MYSTERY_2: [string, string, number][] = [
  ['Word Smuggler', 'Slip "banana republic" into a conversation twice.', 45],
  ['The Plant', 'Get a stranger to call a player by the wrong name.', 55],
  ['Toastmaster', 'Get someone else to propose a toast to you.', 50],
  ['Sleeper Cell', 'Start a crew-wide slow clap. Don\'t lead it.', 50],  ['Echo', 'Repeat the last word someone says, 5 times. Undetected.', 45],
  ['Fake Birthday', 'Get staff to sing to a crew member.', 60],
  ['Name Drop', 'Get a stranger to say Christoffer\'s name.', 50],
  ['Puppet Master', 'Get Simen to order what you whisper. Secretly.', 55],
  ['Body Double', 'Get a stranger to wear your jacket for a photo.', 45],
  ['Wingman', 'Get a stranger to compliment Nikolai.', 50],
];

// Starter templates for random drops. Written to work anywhere, since the destination is unknown.
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
const ins = () => db.prepare('INSERT INTO mission_pool (kind, title, description, reward) VALUES (?, ?, ?, ?)');

export function seedPoolIfEmpty() {
  const n = (db.prepare('SELECT COUNT(*) n FROM mission_pool').get() as { n: number }).n;
  if (n) {
    topUp('pool_batch_2', SIDE_2, MYSTERY_2);
    return;
  }
  const stmt = ins();
  for (const [t, d, r] of SIDE) stmt.run('side', t, d, r);
  for (const [t, d, r] of MYSTERY) stmt.run('mystery', t, d, r);
  setSetting('pool_batch_2', '1');
}

// Adds a batch of new templates to a pool that already exists (the live server), once.
// Runs a single time per batch key, so templates the GM deletes afterwards stay deleted.
function topUp(key: string, side: Template[], mystery: Template[]) {
  if (getSetting(key)) return;
  const has = db.prepare('SELECT 1 FROM mission_pool WHERE title = ?');
  const stmt = ins();
  db.transaction(() => {
    for (const [kind, list] of [['side', side], ['mystery', mystery]] as const)
      for (const [t, d, r] of list) if (!has.get(t)) stmt.run(kind, t, d, r);
    setSetting(key, '1');
  })();
}

// ---------- bulk add from the GM panel ----------
// Paste one mission per line, in either format:
//   Title | Briefing | 30                     (reward optional, defaults to 30)
//   ['Title', 'Briefing', 30],                (same shape as the lists above)
// A line that says "side" or "mystery" on its own, or a comment like "// add to MYSTERY",
// switches the kind for the lines below it. Blank lines are ignored.

type Parsed = { kind: 'side' | 'mystery'; title: string; description: string; reward: number };

const JS_ROW = /^\[\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3\s*,\s*(\d+)\s*\]\s*,?$/;
const unescape = (s: string) => s.replace(/\\(.)/g, '$1');

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
    let title: string, description: string, reward: number;
    const js = line.match(JS_ROW);
    if (js) {
      [title, description, reward] = [unescape(js[2]), unescape(js[4]), Number(js[5])];
    } else if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length > 3 || (parts[2] && !/^\d+$/.test(parts[2]))) return void errors.push(`line ${i + 1}: use Title | Briefing | 30`);
      [title, description, reward] = [parts[0], parts[1] ?? '', parts[2] ? Number(parts[2]) : 30];
    } else {
      return void errors.push(`line ${i + 1}: not a mission`);
    }
    if (!title) return void errors.push(`line ${i + 1}: missing title`);
    if (reward < 1 || reward > 1000) return void errors.push(`line ${i + 1}: reward must be 1-1000`);
    rows.push({ kind, title: title.slice(0, 200), description: description.slice(0, 1000), reward });
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
      stmt.run(r.kind, r.title, r.description, r.reward);
      r.kind === 'side' ? side++ : mystery++;
    }
  })();
  return { side, mystery, skipped };
}
