import { db } from './db.ts';

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
];
const MYSTERY: [string, string, number][] = [
  ['Mixologist', 'Get someone to order a drink you picked for them.', 45],
  ['Secret Agent', 'Make someone say "pineapple". Secretly.', 50],
  ['The Mole', 'Get a player to believe a harmless fake fact.', 50],
  ['Silent Partner', 'Compliment everyone within the hour. Act natural.', 40],
  ['Ghost', 'Steal someone\'s seat unnoticed.', 45],
  ['Inside Job', 'Get a drink bought for you. Never ask.', 60],
];

export function seedPoolIfEmpty() {
  const n = (db.prepare('SELECT COUNT(*) n FROM mission_pool').get() as { n: number }).n;
  if (n) return;
  const ins = db.prepare('INSERT INTO mission_pool (kind, title, description, reward) VALUES (?, ?, ?, ?)');
  for (const [t, d, r] of SIDE) ins.run('side', t, d, r);
  for (const [t, d, r] of MYSTERY) ins.run('mystery', t, d, r);
}
