// First-open joke: a silly "too good to be true" message from a made-up prince, in the game's own voice.
// Loaded on demand only after a valid invite code, so it never sits in the main page or bundle.
// Deliberately absurd, no real brand, no input fields, no money/credential/security wording:
// nothing can be typed, nothing is stored except "seen" and "fell for it" flags, nothing is sent.
import { $ } from './ui.ts';
import { put } from './gag.ts';

export function gagScreen(app: HTMLElement, done: () => void, onFell?: () => void) {
  put('ww_gag_seen', '1');
  app.innerHTML = `
    <div class="gag">
      <div class="gag-mail">
        <div class="gag-bar"><span>✉︎ 1 new message</span><span class="gag-from">from: Prince Gustavo of Atlantis (real prince, trust me)</span></div>
        <div class="gag-body">
          <div class="gag-logo">THE ROYAL COURT OF ATLANTIS<br/><small>EST. LAST TUESDAY</small></div>
          <h1>GREETINGS, LUCKY FRIEND!!! 1.000.000 RESPECT AWAITS 🎉👑</h1>
          <p>Dear <b>[YOUR NAME HERE]</b>,</p>
          <p>I am a very real prince with a very real problem: my 1.000.000 Respect is stuck in a sandcastle. Send me just <b>one (1) snack</b> and I will share it ALL with you. Offer melts in <b class="gag-timer">00:59</b> seconds.</p>
          <ul class="gag-list">
            <li>Your favourite snack: <i>already chosen for you ✔︎</i></li>
            <li>Your karaoke song: <i>we know. we all know.</i></li>
            <li>Your shoe size: <i>suspiciously large</i></li>
            <li>Your dignity: <i>pending transfer…</i></li>
          </ul>
          <button class="gag-cta" id="gag-claim">YES PRINCE, TAKE MY SNACK!!!</button>
          <button class="gag-sus" id="gag-sus">Nice try, Gustavo</button>
          <p class="gag-fine">Sent from a sandcastle in a kingdom we made up. Replying costs 200 Respect. Spelling mistakes are a royal tradition.</p>
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
    if (fell) onFell ? onFell() : put('ww_gag_fell', '1');
    app.innerHTML = `
      <div class="splash gag-reveal">
        <h1 class="gag-big">${fell ? 'GOT YOU' : 'STREET SMART'}</h1>
        ${
          fell
            ? `<p class="lead">You just gave your snack to a made-up prince.</p>
               <p>Relax, it's a joke. Nothing was sent anywhere. But the city noticed.</p>`
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
