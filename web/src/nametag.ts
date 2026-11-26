// Nametag in the header. Usually your real name, but now and then it "slips" to a wrong one
// (Jens shows Ivar, Christoffer shows 🍞 ...) for a few seconds, then corrects itself.
import { esc } from './ui.ts';

const OPEN_CHANCE = 0.25; // chance the tag is wrong when you open the app
const LINGER_CHANCE = 0.35; // chance per check while you stay on screen
const WRONG_MS = 2600;

let rolledThisVisit = false;
let timer: number | undefined;
let revert: number | undefined;

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export const nametagHtml = (name: string) => `<a class="nametag" id="nametag" href="#/me">${esc(name)}</a>`;

function slip(el: HTMLElement, name: string, aliases: string[]) {
  clearTimeout(revert);
  el.textContent = pick(aliases);
  el.classList.add('slip');
  revert = window.setTimeout(() => {
    el.textContent = name;
    el.classList.remove('slip');
    el.classList.add('fix');
    window.setTimeout(() => el.classList.remove('fix'), 400);
  }, WRONG_MS);
}

// Call after each header render
export function mountNametag(name: string, aliases: string[]) {
  clearTimeout(timer);
  const el = document.getElementById('nametag');
  if (!el || !aliases.length) return;
  if (!rolledThisVisit) {
    rolledThisVisit = true;
    if (Math.random() < OPEN_CHANCE) window.setTimeout(() => slip(el, name, aliases), 700);
  }
  const loop = () => {
    timer = window.setTimeout(() => {
      if (!document.hidden && el.isConnected && Math.random() < LINGER_CHANCE) slip(el, name, aliases);
      if (el.isConnected) loop();
    }, 20000 + Math.random() * 25000);
  };
  loop();
}

// A fresh roll each time the app comes back to the foreground
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') rolledThisVisit = false;
});

