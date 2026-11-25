// First-open joke: an over-the-top fake "scam" screen in the game's own voice.
// It is deliberately absurd, uses no real brand, and has NO real input fields:
// nothing can be typed, nothing is stored except "seen" and "fell for it" flags, nothing is sent.
import { $ } from './ui.ts';

const SEEN = 'ww_gag_seen';
const FELL = 'ww_gag_fell';

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const put = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export const gagSeen = () => get(SEEN) === '1';
export const fellForGag = () => get(FELL) === '1';
export const clearFell = () => put(FELL, '0');

export function gagScreen(app: HTMLElement, done: () => void, onFell?: () => void) {
  put(SEEN, '1');
  app.innerHTML = `
    <div class="gag">
      <div class="gag-mail">
        <div class="gag-bar"><span>✉︎ 1 new message</span><span class="gag-from">from: totally.real.bank@trust-me-bro.biz</span></div>
        <div class="gag-body">
          <div class="gag-logo">FIRST NATIONAL BANK<br/><small>OF DEFINITELY NOT CRIME</small></div>
          <h1>URGENT!!! YOU HAVE WON 1.000.000 RESPECT 🎉💰</h1>
          <p>Dear Valued Customer (Name: <b>[INSERT NAME]</b>),</p>
          <p>Our very real security team has detected suspicious levels of <b>being too cool</b> on your account. To avoid immediate suspension of your weekend, please verify your identity below within <b class="gag-timer">00:59</b> seconds.</p>
          <div class="gag-form">
            <div class="gag-field"><label>Full name, all middle names, and nickname from school</label><div>Prefilled by our AI ✔︎</div></div>
            <div class="gag-field"><label>Mother's maiden name, father's maiden name, dog's maiden name</label><div>Prefilled by our AI ✔︎</div></div>
            <div class="gag-field"><label>Every PIN you have ever used</label><div>•••• •••• •••• (we already know)</div></div>
            <div class="gag-field"><label>Your soul</label><div><i>Pending transfer…</i></div></div>
          </div>
          <button class="gag-cta" id="gag-claim">CLAIM MY 1.000.000 RESPECT NOW!!!</button>
          <button class="gag-sus" id="gag-sus">This looks extremely legit… but no</button>
          <p class="gag-fine">This e-mail was sent by a prince of a country we made up, on behalf of a bank that is also made up. Unsubscribing will cost 200 Respect. Typos are a security feature.</p>
        </div>
      </div>
    </div>`;
  let s = 59;
  const t = setInterval(() => {
    s = Math.max(0, s - 1);
    const el = $('.gag-timer');
    if (!el) return clearInterval(t);
    el.textContent = `00:${String(s).padStart(2, '0')}`;
  }, 1000);
  const reveal = (fell: boolean) => {
    clearInterval(t);
    if (fell) onFell ? onFell() : put(FELL, '1');
    app.innerHTML = `
      <div class="splash gag-reveal">
        <h1 class="gag-big">${fell ? 'SCAMMED' : 'STREET SMART'}</h1>
        ${
          fell
            ? `<p class="lead">You just gave your soul to a fake bank.</p>
               <p>Relax, it's a joke. Nothing was collected. But the city noticed.</p>`
            : `<p class="lead">You saw straight through it.</p>
               <p>Lesson one: trust nobody. Especially not the other five.</p>`
        }
        <button class="btn primary" id="gag-go">${fell ? 'Accept my shame' : 'Enter the city'}</button>
      </div>`;
    $('#gag-go')!.onclick = done;
  };
  $('#gag-claim')!.onclick = () => reveal(true);
  $('#gag-sus')!.onclick = () => reveal(false);
}
