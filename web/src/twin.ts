// "Mistaken identity" gag for the two players who always get mixed up.
// Their personal QR card is labeled with the other one's name. Scanning it greets them
// as the other guy, the app glitches, investigates, and then corrects itself to their real name.
import { $, esc } from './ui.ts';

const SEEN = 'ww_twin_seen';
export const twinSeen = () => {
  try {
    return localStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Morph one name into another, letter by letter, through random noise
async function scramble(el: HTMLElement, from: string, to: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&@!?';
  const len = Math.max(from.length, to.length);
  for (let step = 0; step <= len * 3; step++) {
    const fixed = Math.floor(step / 3);
    let out = '';
    for (let i = 0; i < len; i++) {
      if (i < fixed) out += to[i] ?? '';
      else out += chars[Math.floor(Math.random() * chars.length)];
    }
    el.textContent = out;
    await wait(55);
  }
  el.textContent = to;
}

export function twinScreen(app: HTMLElement, realName: string, decoyName: string, done: () => void) {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {}
  const real = esc(realName);
  const decoy = esc(decoyName);
  app.innerHTML = `
    <div class="splash twin">
      <p class="kind">PLAYER PROFILE LOADED</p>
      <h1 class="twin-hello">WELCOME BACK,<br/><span id="twin-name">${decoy.toUpperCase()}</span></h1>
      <div class="card twin-card" id="twin-card">
        <div class="twin-photo">?</div>
        <dl>
          <dt>Status</dt><dd id="twin-status">Definitely you</dd>
          <dt>Known aliases</dt><dd id="twin-alias">${real} (by mistake)</dd>
          <dt>Last seen</dt><dd id="twin-seen">Being called ${real}</dd>
        </dl>
      </div>
      <div class="twin-load"><i id="twin-bar"></i></div>
      <p class="small muted" id="twin-loadtxt">Syncing your profile…</p>
      <div class="twin-alert" id="twin-alert" hidden>⚠ IDENTITY MISMATCH</div>
      <pre class="twin-log" id="twin-log"></pre>
      <p class="lead" id="twin-final" hidden></p>
      <button class="btn primary" id="twin-go" hidden>That's me (I think)</button>
    </div>`;

  const run = async () => {
    const bar = $('#twin-bar')!;
    bar.style.width = '0%';
    await wait(50);
    bar.style.width = '87%';
    await wait(1800);
    // the glitch
    const root = $('.twin')!;
    root.classList.add('glitch');
    $('#twin-loadtxt')!.textContent = 'Sync failed at 87%.';
    $('#twin-alert')!.hidden = false;
    await wait(500);
    const log = $('#twin-log')!;
    const lines = [
      `> Running face recognition… 50% ${decoyName}, 50% ${realName}`,
      `> Asking the group chat… 3 say ${decoyName}, 2 say ${realName}, 1 says "who?"`,
      `> Asking your mum… she also isn't sure`,
      `> Checking the invitation code instead… ✓ match`,
    ];
    for (const line of lines) {
      log.textContent += line + '\n';
      await wait(750);
    }
    root.classList.remove('glitch');
    await scramble($('#twin-name')!, decoyName.toUpperCase(), realName.toUpperCase());
    $('#twin-status')!.textContent = 'Actually you';
    $('#twin-alias')!.textContent = `${decoyName} (according to everyone else)`;
    $('#twin-seen')!.textContent = 'Right now, being correctly identified';
    $('#twin-card')!.classList.add('fixed');
    bar.style.width = '100%';
    $('#twin-loadtxt')!.textContent = 'Profile corrected.';
    $('#twin-alert')!.hidden = true;
    const fin = $('#twin-final')!;
    fin.innerHTML = `Sorry about that, <b>${real}</b>. Happens to everyone. Mostly to you two.`;
    fin.hidden = false;
    $('#twin-go')!.hidden = false;
  };
  $('#twin-go')!.onclick = done;
  run();
}
