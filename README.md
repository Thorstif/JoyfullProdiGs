# JoyfullProdiGs

Design rule: fast in, fast out. Every action is one or two taps, text is short, and the phone should go back in the pocket. The trip comes first.

A crime-city-style companion app for a six-person weekend trip. Players install it on their iPhone home screen, get push notifications for missions, bounties and events, earn Respect and fight for the top of the leaderboard. Thor-Stian is the Game Master and runs everything from the GM panel while also playing.

Original theme and art. No Rockstar names, fonts or assets are used.

## What is in it

| Feature | How it works |
|---|---|
| Login | Six invitation codes (e.g. `WOLF-4821`). No passwords. |
| Respect + ranks | Every player has a Respect score. Leaderboard on the Ranks tab. |
| Missions | GM creates them, or Autopilot drops random side missions from a pool. Players tap **Done ✓** and Respect lands instantly (honor system); it shows in News so the group can call out cheaters, and the GM can **Undo** any completion. Switch "Honor system" off in GM settings to approve each claim yourself. Optional timer and "first N win". |
| Mystery events | Secret missions only one player can see. Autopilot picks a random player. |
| World events | GM broadcast to everyone. |
| Bounties | Any player stakes any amount of their own Respect (1 up to everything not already staked) on a challenge, for anyone or a named player. The claimer can add a short proof note. The issuer confirms and pays, or denies. If the issuer has less Respect left than the stake by the time they pay, the hunter gets whatever is left (never below zero). GM can overrule. |
| Achievements | 11 built in (First Job, Hustler, Bounty Hunter, Night Shift, Kingpin, ...) plus custom ones the GM awards. |
| Double Respect | GM starts a 2x window. Claims made during it pay double. |
| Daily recap | Push every morning (default 09:00) with yesterday's MVP and standings. |
| Final standings | GM taps a button, or set a time in Autopilot. Winner gets **Kingpin**. |
| Scam gag | The first time someone opens their personal invite link in a browser they get an absurd "too good to be true" message from Prince Gustavo of Atlantis asking for one snack in exchange for 1,000,000 Respect. Only shown after a valid invite code, loaded as a separate file, no input fields, no bank/login/security wording, sends nothing. Tapping **YES PRINCE** reveals the joke and earns them the secret **Easy Mark** achievement after login. Shown once per device. |
| Mix-up gag | Two look-alikes (Jens and Ivar). Every QR card carries its owner's own name, so swapping cards can't break anything. When Jens scans his card, the app greets him as "Ivar", the profile glitches, runs a fake investigation ("asking the group chat… 3 say Ivar, 2 say Jens"), then the name scrambles into the right one. Earns **Mistaken Identity**. Pick the pair in the GM panel under Gags. |
| Nametag | A small name sticker under the logo. Usually right, but now and then it slips to a wrong name for a few seconds (Jens shows Ivar, Christoffer shows 🍞, Nikolai shows 👶...) and corrects itself. Defaults live in `server/aliases.ts`; the GM can change anyone's list with "tag" in the players table. |
| The Crown | One Crown, passed around all weekend. Anyone can crown anyone (not themselves, not the current holder) at any time with a typed reason. Everyone gets a push: who got it, from whom, and why. The holder shows at the top of every screen, with full history and a times-crowned count. Honorary only, no Respect. The GM can also crown someone anonymously as "the city". Final standings name the last holder and the most-crowned player. |
| Game Master panel | The GM player gets a **GM** button in the header, then enters the PIN. Everyone knows who the GM is; the PIN just stops anyone else using your phone to run it. |

## Stack

Vite + TypeScript (no framework) frontend, Node.js + Express 5 backend, SQLite (better-sqlite3), `web-push` with VAPID keys, `node-cron`. No Firebase, no Apple Developer account.

```
server/    Express API, game rules, push, scheduler, seed script
web/       Vite frontend (index.html, src/, public/ with manifest, sw.js, icons)
data/      SQLite database (created on first run)
```

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env          # set GM_PIN at least
npm run seed -- "Thor-Stian*" Nikolai Christoffer Simen "Jens~" "Ivar~"   # * = Game Master, ~ = mix-up pair; prints the six codes
npm run dev                   # API on :3000, app on http://localhost:5173
```

`npm run seed` with no names prints the existing codes again. `npm run seed -- --reset "Thor-Stian*" ...` wipes the game and makes new codes.

Push notifications need HTTPS (localhost is the exception in desktop browsers), so to test on an iPhone you need the real deployment below.

## Deploy to a VPS with HTTPS

Fastest path (about 10 minutes, no SSH needed): `deploy/setup.sh` installs everything on a fresh Ubuntu 24.04 server (Node 22, Caddy for automatic HTTPS, firewall, a systemd service that restarts on crash or reboot), creates the six players and starts the app.

1. Point the domain's DNS (A record for `@` and `www`) at the server's IP.
2. On DigitalOcean, create an Ubuntu 24.04 droplet and paste this into **Advanced options > Add initialization scripts (free)**, with your values:
   ```bash
   #!/bin/bash
   export DOMAIN=joyfullprodigs.lol EMAIL=you@yourmail.com GM_PIN=1234 GM_CODE=THOR-1234
   export REPO=https://github.com/Thorstif/JoyfullProdiGs.git
   curl -fsSL https://raw.githubusercontent.com/Thorstif/JoyfullProdiGs/main/deploy/setup.sh | bash
   ```
   (This needs the repo to be public. Nothing secret is in it.)
3. After a few minutes, `https://joyfullprodigs.lol/api/health` answers `{"ok":true,...}`. Setup output is in `/var/log/cloud-init-output.log` on the server.

Manual alternative on any Ubuntu server: `git clone` the repo, then `sudo DOMAIN=... EMAIL=... REPO=... GM_PIN=... GM_CODE=... bash deploy/setup.sh`.

Auto-deploy: the server checks GitHub `main` every 5 minutes. New commits are pulled, built and restarted automatically, and rolled back if the health check fails. Log: `journalctl -u joyfull-update`.

Backups: the app copies the database every hour to `data/backups/` and keeps 48. To restore: `sudo systemctl stop joyfull`, copy a backup over `data/game.db`, `sudo systemctl start joyfull`.

### Updating during the trip

```bash
sudo bash /opt/joyfull/deploy/update.sh
```
Scores live in `data/game.db` and survive restarts. Back it up with `cp data/game.db ~/game-backup.db`.

## Player onboarding (iPhone)

1. Scan your personal QR card. It opens in your default browser. If that isn't Safari (Brave, Chrome, Firefox, in-app browsers), the install screen shows **Open in Safari** and **Copy link**; the Safari link skips the gags you already saw. First the scam gag, then (for Jens and Ivar) the mix-up gag.
2. Share button, **Add to Home Screen**, Add.
3. Open **JoyfullProdiGs** from the home screen (not from Safari).
4. Enter the invitation code. Safari showed it on the install screen.
5. Tap **Start the story** and allow notifications. A test notification arrives right away.

If a player logged in from Safari first, they just enter the code again in the home-screen app. The same code works on several devices.

## Game Master guide

- **Veto a mission.** If a job doesn't fit (wrong place, impossible, steals too much focus), GM panel → "Live jobs" → **Veto ↻** (tap twice). The job disappears, pending claims on it are dropped, a fresh one from the pool is pushed in its place (a secret job is swapped for another secret job for the same person), and the vetoed one is banned from the pool for the rest of the trip. Changed your mind? "Mission pool" → restore.

- **Test, then reset.** Play around as much as you like before kickoff, then GM panel → "Reset game (after testing)" → type RESET. It wipes Respect, jobs, claims, bounties, crown, achievements and the feed and sets the game back to not started, but keeps players, codes, logins, phones/alerts, nametags and settings. A backup is taken first, and phones clear their cached data and replay the gags on the next open.

- Open the panel: tap **GM** in the header and enter `GM_PIN`. Other players never see the button, and the API answers 404 to them.
- **Autopilot starts itself** at `TRIP_START` (Friday 12:00) with a short GAME ON push, and final standings go out at `FINAL_AT` (Sunday 22:00), which also switches autopilot off. Both are in `.env`, and the GM panel can override them. Without them, turn Autopilot on in the panel. It drops a random side mission every 2.5 to 4 hours between 11:00 and 23:00 local time (about 3 a day), with a 15% chance of a secret mystery event for one random player. All of this is adjustable live.
- The mission pool starts with 23 generic missions (drinking ones included) that work in any city. Add your own once you know the destination.
- Missions run on the honor system, so you get no claim alerts. If someone cheated, GM panel → "Recently completed" → **Undo** (tap twice) takes the points back and reopens the slot.

## Before departure checklist

- [ ] Deployed with HTTPS and a real `VAPID_SUBJECT` email (Apple rejects some placeholder values)
- [ ] Every player installed the app and received the test notification
- [ ] In the GM panel under "Players and invite codes", every row shows Joined ✓ and at least 1 phone
- [ ] Use **ping** next to each player to check delivery again
- [ ] Tell everyone Focus modes can hide notifications. Add JoyfullProdiGs to the allowed apps in each Focus mode.
- [ ] Turn on Autopilot

## Troubleshooting

- **No notifications on iPhone:** the app must be opened from the home screen, not Safari. Check Settings > Notifications > JoyfullProdiGs. In the app, Me tab > Re-enable alerts, then Send me a test alert.
- **"Sent to 0 phones":** that player has no subscription. Have them open the app and tap Re-enable alerts.
- **Changed VAPID keys:** all existing subscriptions stop working, and everyone must re-enable alerts. Keys are generated once and stored in the database unless you set them in `.env`, so do not delete `data/game.db` mid-trip.
- **Times look wrong:** set `TZ` in `.env` to the destination's time zone and restart.
