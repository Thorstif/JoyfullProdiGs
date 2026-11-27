import { db, getSetting, setSetting } from './db.ts';

// Batch 2, added mid-trip. Kept separate so it can be topped up into an existing pool once.
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
];
const MYSTERY_2: [string, string, number][] = [
  ['Word Smuggler', 'Slip "banana republic" into a conversation twice.', 45],
  ['The Plant', 'Get a stranger to call a player by the wrong name.', 55],
  ['Toastmaster', 'Get someone else to propose a toast to you.', 50],
  ['Sleeper Cell', 'Start a crew-wide slow clap. Don\'t lead it.', 50],
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
