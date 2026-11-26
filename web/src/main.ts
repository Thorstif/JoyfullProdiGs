import { mountNametag, nametagHtml } from './nametag.ts';
import './style.css';
import { api, ApiError, store } from './api.ts';
import { renderGm } from './gm.ts';
import { twinScreen, twinSeen } from './twin.ts';
import { gagScreen, gagSeen, fellForGag, clearFell } from './gag.ts';
import { esc, ago, $, toast, timeLeft, banner } from './ui.ts';

type Me = {
  id: number;
  name: string;
  aliases?: string[];
  respect: number;
  rank: number;
  players: number;
  isGm: boolean;
  pushDevices: number;
  doubleUntil: string | null;
  finalAt: string | null;
  crown: { id: number; name: string; since: string; reason: string; fromName: string | null } | null;
  achievements: { key: string; title: string; description: string; created_at: string }[];
  allAchievements: { key: string; title: string; description: string }[];
  log: { delta: number; reason: string; created_at: string }[];
};

const app = document.getElementById('app')!;
let cfg = { appName: 'JoyfullProdiGs', vapidPublicKey: '', scamGag: true, resetEpoch: '', forwardTo: '' };
type Intro = { name: string; code: string; scamGag: boolean; decoy: { name: string } | null };
let intro: Intro | null = null; // set when the app was opened from a personal QR (/?invite=CODE)

const INVITE_KEY = 'ww_invite';
function takeInviteFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get('invite');
  if (code) {
    try {
      localStorage.setItem(INVITE_KEY, code);
    } catch {}
    // seen=1: reopened in Safari from another browser, where the gags already played
    if (params.get('seen') === '1') {
      try {
        localStorage.setItem('ww_gag_seen', '1');
        localStorage.setItem('ww_twin_seen', '1');
      } catch {}
    }
    history.replaceState(null, '', location.pathname + location.hash); // keep the code out of the address bar
  }
  try {
    return code || localStorage.getItem(INVITE_KEY) || '';
  } catch {
    return code || '';
  }
}
let me: Me | null = null;
let lastRespect: number | null = null;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
// Brave on iOS hides behind a Safari user agent, so also check navigator.brave
const notSafari = isIOS && (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser|FBAN|FBAV|Instagram|Line\/|Snapchat/.test(navigator.userAgent) || !!(navigator as any).brave);
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// ---------- push ----------

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.vapidPublicKey) });
  }
  await api('/push/subscribe', { body: { subscription: sub.toJSON() } });
}

// Must be called straight from a tap: iOS only shows the prompt inside a user gesture.
async function enablePush() {
  if (!pushSupported) throw new Error(isIOS && !isStandalone ? 'Open the app from your home screen first.' : 'This browser cannot do push notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were blocked. Turn them on in Settings > Notifications > JoyfullProdiGs.');
  await subscribePush();
}

// ---------- screens without the tab bar ----------

// Personal link for reopening in Safari (seen=1 so the gags don't replay there)
function shareUrl() {
  const code = intro?.code || (() => { try { return localStorage.getItem(INVITE_KEY) || ''; } catch { return ''; } })();
  return `${location.origin}/${code ? `?invite=${encodeURIComponent(code)}&seen=1` : ''}`;
}
// x-safari-https:// opens Safari directly on iOS 17+; older iOS ignores it, so Copy link is the fallback
const safariUrl = () => shareUrl().replace(/^https:/, 'x-safari-https:').replace(/^http:/, 'x-safari-http:');

function installScreen() {
  app.innerHTML = `
    <div class="splash">
      <div class="logo big">${logoText()}</div>
      <p class="lead">Add the app to your home screen. That's how your iPhone gets alerts.</p>
      ${
        notSafari
          ? `<div class="card safari-card"><b>Open this in Safari first.</b><small>Other browsers often can't add it to the home screen properly.</small>
             <div class="row"><a class="btn primary small" href="${esc(safariUrl())}">Open in Safari</a><button class="btn small ghost" id="copy-link">Copy link</button></div></div>`
          : ''
      }
      <ol class="steps">
        <li>Tap the <b>Share</b> button <span class="share-ico">⬆︎</span> at the bottom of Safari.</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
        <li>Tap <b>Add</b>, then open <b>JoyfullProdiGs</b> from your home screen.</li>
      </ol>
      ${intro ? `<div class="card code-card"><small>Card for <b>${esc(intro.name)}</b>. Not you? Swap cards. Your code:</small><b>${esc(intro.code)}</b><small>You'll type this once after opening it from the home screen.</small></div>` : ''}
      ${notSafari ? '' : `<p class="small muted">Needs iOS 16.4 or newer. Not in Safari? <a href="${esc(safariUrl())}">Open in Safari</a> · <button class="link" id="copy-link">copy link</button></p>`}
      <button class="link" id="skip">Continue in the browser anyway</button>
    </div>`;
  $('#skip')!.onclick = () => loginScreen();
  $('#copy-link')!.onclick = async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied. Paste it in Safari.');
    } catch {
      toast(url);
    }
  };
}

function loginScreen() {
  app.innerHTML = `
    <div class="splash">
      <div class="logo big">${logoText()}</div>
      <p class="lead">Enter your invitation code.</p>
      <form id="login" class="stack">
        <input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="WOLF-1234" value="${esc(intro?.code || '')}" required />
        <button class="btn primary">Enter the city</button>
        <p class="error" id="err"></p>
      </form>
    </div>`;
  $('#login')!.onsubmit = async (e) => {
    e.preventDefault();
    const code = (new FormData(e.target as HTMLFormElement).get('code') as string) || '';
    try {
      const r = await api<{ token: string }>('/login', { body: { code } });
      store.token = r.token;
      if (fellForGag()) {
        clearFell();
        api('/gag', { body: {} }).catch(() => {});
      }
      await loadMe();
      storyScreen();
    } catch (err: any) {
      $('#err')!.textContent = err.message;
    }
  };
}

function storyScreen() {
  const granted = pushSupported && Notification.permission === 'granted';
  app.innerHTML = `
    <div class="splash story">
      <div class="logo big">${logoText()}</div>
      <p class="lead">Welcome, <b>${esc(me!.name)}</b>.</p>
      <p>Your phone buzzes, you do the job, you earn Respect. Then put the phone away.</p>
      <button class="btn primary" id="start">${granted ? 'Continue' : 'Start the story'}</button>
      <p class="error" id="err"></p>
      <button class="link" id="later">Skip notifications for now</button>
    </div>`;
  $('#start')!.onclick = async () => {
    try {
      if (!granted) await enablePush();
      else await subscribePush();
      await api('/push/test', { body: {} });
      location.hash = '#/';
      route();
    } catch (err: any) {
      $('#err')!.textContent = err.message;
    }
  };
  $('#later')!.onclick = () => {
    location.hash = '#/';
    route();
  };
}

// ---------- shell ----------

function logoText() {
  // "Two Words" splits on the space; "JoyfullProdiGs" splits before the second word's capital
  let [a, ...rest] = cfg.appName.split(' ');
  if (!rest.length) {
    const i = cfg.appName.search(/(?<=[a-z])[A-Z]/);
    if (i > 0) [a, rest] = [cfg.appName.slice(0, i), [cfg.appName.slice(i)]];
  }
  return `<span>${esc(a)}</span>${rest.length ? `<em>${esc(rest.join(' '))}</em>` : ''}`;
}

const TABS = [
  ['#/', 'Home', '★'],
  ['#/missions', 'Missions', '◎'],
  ['#/bounties', 'Bounties', '$'],
  ['#/leaderboard', 'Ranks', '♛'],
  ['#/feed', 'News', '☰'],
];

function shell(active: string) {
  const c = me?.crown;
  const crownStrip = `<a class="crown-strip ${c?.id === me?.id ? 'mine' : ''}" href="#/crown"><span class="crown-ico">♛</span>${
    c ? `<span><b>${c.id === me?.id ? 'You' : esc(c.name)}</b> <small>“${esc(c.reason)}”</small></span>` : `<span><b>Crown up for grabs</b></span>`
  }</a>`;
  const dbl = me?.doubleUntil ? `<div class="double">2X DOUBLE RESPECT <span data-until="${me.doubleUntil}"></span></div>` : '';
  app.innerHTML = `
    <header class="top">
      <div class="brand"><div class="logo" id="logo">${logoText()}</div>${me ? nametagHtml(me.name) : ''}</div>
      ${me?.isGm ? `<a class="gm-btn" href="#/gm">GM</a>` : ''}
      <a class="respect" href="#/me"><small>RESPECT</small><b class="${(me?.respect ?? 0) < 0 ? 'neg' : ''}">${me?.respect ?? 0}</b><small>#${me?.rank ?? '-'} of ${me?.players ?? '-'}</small></a>
    </header>
    ${dbl}
    ${active === '#/crown' ? '' : crownStrip}
    <main id="view"></main>
    <nav class="tabs">${TABS.map(([h, l, i]) => `<a href="${h}" class="${h === active ? 'on' : ''}"><i>${i}</i>${l}</a>`).join('')}</nav>`;
  setupGmGesture();
  if (me) mountNametag(me.name, me.aliases ?? []);
  tickTimers();
  return $('#view')!;
}

// Game Master entry: the GM button, or press and hold the logo for 1.5 seconds (GM only).
function setupGmGesture() {
  const logo = $('#logo');
  if (!logo || !me?.isGm) return;
  let t: number | undefined;
  const start = () => (t = window.setTimeout(() => (location.hash = '#/gm'), 1500));
  const cancel = () => clearTimeout(t);
  logo.addEventListener('touchstart', start, { passive: true });
  logo.addEventListener('mousedown', start);
  ['touchend', 'touchmove', 'mouseup', 'mouseleave'].forEach((ev) => logo.addEventListener(ev, cancel));
  logo.addEventListener('contextmenu', (e) => e.preventDefault());
}

function tickTimers() {
  document.querySelectorAll<HTMLElement>('[data-until]').forEach((el) => (el.textContent = timeLeft(el.dataset.until!)));
}
setInterval(tickTimers, 1000);

async function loadMe() {
  me = await api<Me>('/me');
  if (lastRespect !== null && me.respect > lastRespect) {
    banner('RESPECT +', `+${me.respect - lastRespect}`);
  }
  lastRespect = me.respect;
}

// ---------- views ----------

async function homeView() {
  const missions = await api<any[]>('/missions');
  const open = missions.filter((m) => m.open && !m.my_status);
  const v = shell('#/');
  const pushOff = pushSupported && Notification.permission !== 'granted';
  v.innerHTML = `
    ${pushOff || (me && me.pushDevices === 0) ? `<div class="card warn"><div><b>Alerts are off.</b></div><button class="btn small" id="push">Turn on</button></div>` : ''}
    ${me?.finalAt ? `<div class="card gold"><h3>FINAL STANDINGS ARE IN</h3><a href="#/leaderboard">See who runs the city →</a></div>` : ''}
    <h2>Open jobs</h2>
    ${open.length ? open.slice(0, 3).map(missionCard).join('') : `<p class="muted">No open jobs. Enjoy the trip.</p>`}
    ${open.length > 3 ? `<a class="btn ghost" href="#/missions">${open.length - 3} more</a>` : ''}`;
  $('#push')?.addEventListener('click', async () => {
    try {
      await enablePush();
      toast('Alerts on. Stay frosty.');
      await loadMe();
      route();
    } catch (e: any) {
      toast(e.message);
    }
  });
  bindClaims(v);
}

const KIND: Record<string, string> = { side: 'SIDE MISSION', world: 'WORLD EVENT', mystery: 'TOP SECRET', gm: 'MISSION' };

function missionCard(m: any) {
  const status = m.my_status
    ? `<span class="pill ${m.my_status}">${m.my_status === 'pending' ? 'Awaiting word' : m.my_status === 'approved' ? 'Complete' : 'Failed'}</span>`
    : !m.open
      ? `<span class="pill closed">Closed</span>`
      : '';
  const timer = m.open && m.expires_at ? `<span class="timer" data-until="${m.expires_at}"></span>` : '';
  const canClaim = m.open && !m.my_status;
  return `
    <div class="card mission ${m.kind} ${m.open ? '' : 'dim'}">
      <div class="row"><span class="kind">${KIND[m.kind] || 'MISSION'}</span>${timer}${status}</div>
      <h3>${esc(m.title)}</h3>
      ${m.description ? `<p>${esc(m.description)}</p>` : ''}
      <div class="row"><b class="reward">+${m.reward} RESPECT${me?.doubleUntil && canClaim ? ' x2' : ''}</b>${m.max_winners ? `<small class="muted">${m.max_winners === 1 ? 'First one wins' : `First ${m.max_winners} win`}</small>` : ''}</div>
      ${
        canClaim
          ? `<form class="claim stack" data-id="${m.id}">
              <button class="btn primary">Done ✓</button>
            </form>`
          : ''
      }
    </div>`;
}

function bindClaims(root: HTMLElement) {
  root.querySelectorAll<HTMLFormElement>('form.claim').forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api<{ status: string; awarded: number }>(`/missions/${f.dataset.id}/claim`, { body: { note: new FormData(f).get('note') } });
        toast(r?.status === 'approved' ? `+${r.awarded} Respect` : 'Sent for review.');
        route();
      } catch (err: any) {
        toast(err.message);
      }
    };
  });
}

async function missionsView() {
  const missions = await api<any[]>('/missions');
  const v = shell('#/missions');
  const open = missions.filter((m) => m.open);
  const past = missions.filter((m) => !m.open);
  v.innerHTML = `
    <h2>Active</h2>
    ${open.length ? open.map(missionCard).join('') : '<p class="muted">Nothing active.</p>'}
    ${past.length ? `<h2>Done and dusted</h2>${past.slice(0, 10).map(missionCard).join('')}` : ''}`;
  bindClaims(v);
}

async function bountiesView() {
  const [bounties, players] = await Promise.all([api<any[]>('/bounties'), api<{ id: number; name: string }[]>('/players')]);
  const v = shell('#/bounties');
  const others = players.filter((p) => p.id !== me!.id);
  const card = (b: any) => {
    const mine = b.issuer_id === me!.id;
    const forMe = !b.target_id || b.target_id === me!.id;
    let actions = '';
    if (b.status === 'open' && mine) actions = `<button class="btn small ghost" data-cancel="${b.id}">Withdraw</button>`;
    else if (b.status === 'open' && forMe)
      actions = `<form class="bclaim" data-id="${b.id}"><button class="btn small primary">Done ✓ claim it</button></form>`;
    else if (b.status === 'claimed' && mine)
      actions = `<p>${esc(b.claimant_name)} claims it${b.claim_note ? `: “${esc(b.claim_note)}”` : ''}</p>
        <div class="row"><button class="btn small primary" data-pay="${b.id}">Pay up</button><button class="btn small ghost" data-deny="${b.id}">Deny</button></div>`;
    const status = b.status === 'paid' ? `<span class="pill approved">Paid to ${esc(b.claimant_name)}</span>` : b.status === 'claimed' ? `<span class="pill pending">Claimed</span>` : b.status === 'cancelled' ? `<span class="pill closed">Withdrawn</span>` : '';
    return `<div class="card bounty ${b.status}">
      <div class="row"><span class="kind">BOUNTY ${b.target_name ? `· ${esc(b.target_name)} only` : '· open to all'}</span>${status}</div>
      <h3>${esc(b.title)}</h3>
      <div class="row"><b class="reward">${b.stake} RESPECT</b><small class="muted">from ${esc(b.issuer_name)}</small></div>
      ${actions}
    </div>`;
  };
  v.innerHTML = `
    <details class="card"><summary><b>+ New bounty</b></summary>
    <form id="newb" class="stack">
      <input name="title" placeholder="e.g. Order in a pirate voice" required maxlength="200" />
      <div class="row">
        <select name="targetId"><option value="">Anyone can take it</option>${others.map((p) => `<option value="${p.id}">Only ${esc(p.name)}</option>`).join('')}</select>
        <input name="stake" type="number" min="5" step="5" value="20" class="num" />
      </div>
      <small class="muted">Paid from your own Respect.</small>
      <button class="btn primary">Post</button>
    </form></details>
    <h2>Bounties</h2>
    ${bounties.length ? bounties.map(card).join('') : '<p class="muted">No bounties yet.</p>'}`;
  $('#newb')!.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await api('/bounties', { body: { title: fd.get('title'), targetId: fd.get('targetId') || null, stake: Number(fd.get('stake')) } });
      toast('Bounty posted.');
      route();
    } catch (err: any) {
      toast(err.message);
    }
  };
  const act = (sel: string, fn: (id: string) => Promise<unknown>) =>
    v.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.onclick = async () => {
        try {
          await fn(Object.values(el.dataset)[0]!);
          await loadMe();
          route();
        } catch (err: any) {
          toast(err.message);
        }
      };
    });
  act('[data-cancel]', (id) => api(`/bounties/${id}/cancel`, { body: {} }));
  act('[data-pay]', (id) => api(`/bounties/${id}/settle`, { body: { pay: true } }));
  act('[data-deny]', (id) => api(`/bounties/${id}/settle`, { body: { pay: false } }));
  v.querySelectorAll<HTMLFormElement>('form.bclaim').forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/bounties/${f.dataset.id}/claim`, { body: { note: new FormData(f).get('note') } });
        toast('Claim sent.');
        route();
      } catch (err: any) {
        toast(err.message);
      }
    };
  });
}

async function leaderboardView() {
  const board = await api<{ id: number; name: string; respect: number }[]>('/leaderboard');
  const v = shell('#/leaderboard');
  const max = Math.max(1, ...board.map((p) => p.respect));
  v.innerHTML = `
    <h2>${me?.finalAt ? 'Final standings' : 'Who runs the city'}</h2>
    <ol class="board">
      ${board
        .map(
          (p, i) => `<li class="${p.id === me!.id ? 'me' : ''}">
          <span class="pos">${i + 1}</span>
          <span class="name">${esc(p.name)}${i === 0 && p.respect > 0 ? ' <span class="crown">♛</span>' : ''}</span>
          <span class="bar"><i style="width:${Math.max(0, (p.respect / max) * 100)}%"></i></span>
          <b class="${p.respect < 0 ? 'neg' : ''}">${p.respect}</b>
        </li>`,
        )
        .join('')}
    </ol>`;
}

async function crownView() {
  const [state, players] = await Promise.all([api<any>('/crown'), api<{ id: number; name: string }[]>('/players')]);
  const v = shell('#/crown');
  const h = state.holder;
  const candidates = players.filter((p) => p.id !== me!.id && p.id !== h?.id);
  v.innerHTML = `
    <div class="crown-hero">
      <div class="crown-big">♛</div>
      ${
        h
          ? `<h2>${esc(h.name)}</h2><p class="lead">“${esc(h.reason)}”</p><p class="small muted">${h.fromName ? `Crowned by ${esc(h.fromName)}` : 'Crowned by the city'} · ${ago(h.since)}</p>`
          : `<h2>Nobody. Yet.</h2><p class="muted">The Crown is waiting for its first head.</p>`
      }
    </div>
    <h2>Pass the Crown</h2>
    <form id="crown-form" class="card stack">
      <select name="toId" required><option value="">Who deserves it?</option>${candidates.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      <input name="reason" maxlength="200" placeholder="Why?" required />
      <div class="radios">${[0, 10, 25, 50].map((n) => `<label><input type="radio" name="bonus" value="${n}" ${n === 0 ? 'checked' : ''} /><span>${n ? `+${n}` : '0'}</span></label>`).join('')}</div>
      <button class="btn primary">Crown them</button>
    </form>
    ${
      state.counts.length
        ? `<h2>Times crowned</h2><ol class="board">${state.counts
            .map((p: any, i: number) => `<li class="${p.id === me!.id ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="name">${esc(p.name)}</span><span></span><b>${p.n}x</b></li>`)
            .join('')}</ol>`
        : ''
    }
    <h2>Crown history</h2>
    <ul class="feed">${
      state.history
        .map((r: any) => `<li class="crown"><b>${esc(r.from_name || 'The city')}</b> → <b>${esc(r.to_name)}</b>${r.bonus ? ` <span class="pos">+${r.bonus}</span>` : ''}: “${esc(r.reason)}”<time>${ago(r.created_at)}</time></li>`)
        .join('') || '<li class="muted">No coronations yet.</li>'
    }</ul>`;
  $('#crown-form')!.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await api('/crown', { body: { toId: Number(fd.get('toId')), reason: fd.get('reason'), bonus: Number(fd.get('bonus') || 0) } });
      banner('♛ LONG LIVE THE KING', String(fd.get('reason') || ''));
      route();
    } catch (err: any) {
      toast(err.message);
    }
  };
}

async function feedView() {
  const feed = await api<any[]>('/feed');
  const v = shell('#/feed');
  v.innerHTML = `
    <h2>City news</h2>
    <ul class="feed">
      ${feed.slice(0, 30).map((f) => `<li class="${f.kind} ${f.private ? 'private' : ''}">${f.private ? '<span class="pill pending">Just you</span> ' : ''}${esc(f.text)}<time>${ago(f.created_at)}</time></li>`).join('') || '<li class="muted">Quiet. Too quiet.</li>'}
    </ul>`;
}

async function meView() {
  const v = shell('');
  const got = new Set(me!.achievements.map((a) => a.key));
  const custom = me!.achievements.filter((a) => !me!.allAchievements.some((d) => d.key === a.key));
  v.innerHTML = `
    <h2>${esc(me!.name)}</h2>
    <div class="card stats"><div><b>${me!.respect}</b><small>Respect</small></div><div><b>#${me!.rank}</b><small>Rank</small></div><div><b>${me!.achievements.length}</b><small>Achievements</small></div></div>
    <h2>Achievements</h2>
    <div class="grid">
      ${[...me!.allAchievements, ...custom]
        .map((a) => `<div class="ach ${got.has(a.key) ? 'got' : ''}"><b>${esc(a.title)}</b><small>${esc(a.description)}</small></div>`)
        .join('')}
    </div>
    <h2>Respect history</h2>
    <ul class="feed">${me!.log.slice(0, 10).map((l) => `<li><b class="${l.delta >= 0 ? 'pos' : 'neg'}">${l.delta >= 0 ? '+' : ''}${l.delta}</b> ${esc(l.reason)}<time>${ago(l.created_at)}</time></li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ul>
    <h2>Phone</h2>
    <div class="card stack">
      <p class="small">Alerts: <b>${pushSupported ? Notification.permission : 'not supported here'}</b> · devices registered: <b>${me!.pushDevices}</b></p>
      <button class="btn" id="enable">Re-enable alerts</button>
      <button class="btn ghost" id="test">Send me a test alert</button>
      <button class="btn ghost" id="logout">Log out</button>
    </div>`;
  $('#enable')!.onclick = async () => {
    try {
      await enablePush();
      toast('Alerts on.');
      await loadMe();
      route();
    } catch (e: any) {
      toast(e.message);
    }
  };
  $('#test')!.onclick = async () => {
    const r = await api<{ sent: number }>('/push/test', { body: {} });
    toast(r.sent ? 'Test sent. Lock your phone to see it.' : 'No device registered. Re-enable alerts first.');
  };
  $('#logout')!.onclick = () => {
    store.token = '';
    store.pin = '';
    location.hash = '';
    boot();
  };
}

async function gmView() {
  const v = shell('');
  if (!me?.isGm) {
    location.hash = '#/';
    return;
  }
  if (!store.pin) return gmPinForm(v);
  try {
    await api('/gm/verify', { body: {}, gm: true });
  } catch {
    store.pin = '';
    return gmPinForm(v, 'Wrong PIN.');
  }
  await renderGm(v, () => route());
}

function gmPinForm(v: HTMLElement, error = '') {
  v.innerHTML = `
    <h2>Game Master</h2>
    <form id="pin" class="card stack">
      <input name="pin" type="password" inputmode="numeric" placeholder="PIN" autocomplete="off" />
      <button class="btn primary">Unlock</button>
      <p class="error">${esc(error)}</p>
    </form>`;
  $('#pin')!.onsubmit = (e) => {
    e.preventDefault();
    store.pin = String(new FormData(e.target as HTMLFormElement).get('pin') || '');
    route();
  };
}

// ---------- routing ----------

let routing = false;
async function route(): Promise<void> {
  if (routing) return;
  routing = true;
  try {
    if (!store.token) return boot();
    await loadMe();
    const h = location.hash || '#/';
    if (h.startsWith('#/missions')) await missionsView();
    else if (h.startsWith('#/bounties')) await bountiesView();
    else if (h.startsWith('#/leaderboard')) await leaderboardView();
    else if (h.startsWith('#/feed')) await feedView();
    else if (h.startsWith('#/me')) await meView();
    else if (h.startsWith('#/crown')) await crownView();
    else if (h.startsWith('#/gm')) await gmView();
    else await homeView();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      store.token = '';
      routing = false;
      return boot();
    }
    toast((err as Error).message);
  } finally {
    routing = false;
  }
}

// Quiet refresh, but never while someone is typing in a form
function softRefresh() {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
  if (location.hash.startsWith('#/gm')) return; // GM panel keeps its open sections
  if (store.token && document.querySelector('#view')) route();
}

window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    (navigator as any).clearAppBadge?.().catch?.(() => {});
    softRefresh();
  }
});
setInterval(softRefresh, 30_000);

// After the GM resets the game, drop cached data and let the gags play again on this device
function applyReset(epoch: string) {
  try {
    const seen = localStorage.getItem('ww_reset_epoch');
    if (!epoch || seen === epoch) return;
    localStorage.setItem('ww_reset_epoch', epoch);
    if (seen === null && !store.token) return; // brand new device, nothing to clear
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('ww_cache:') || ['ww_gag_seen', 'ww_twin_seen', 'ww_gag_fell'].includes(k)) localStorage.removeItem(k);
    }
  } catch {}
}

async function boot(): Promise<void> {
  try {
    cfg = await api('/config');
  } catch {}
  document.title = cfg.appName;
  // GM switched on "forward to backup address" (main domain blocked on some phones): send browser visitors
  // there with their invite code, so they install from the address that works. Installed apps stay put.
  if (cfg.forwardTo && !isStandalone) {
    try {
      const target = new URL(cfg.forwardTo);
      if (target.host !== location.host) {
        const code = new URLSearchParams(location.search).get('invite') || (() => { try { return localStorage.getItem(INVITE_KEY) || ''; } catch { return ''; } })();
        location.replace(`${target.origin}/${code ? `?invite=${encodeURIComponent(code)}` : ''}${location.hash}`);
        return;
      }
    } catch {}
  }
  applyReset(cfg.resetEpoch);
  if (!store.token) {
    const invite = takeInviteFromUrl();
    if (invite) intro = await api<Intro>(`/intro/${encodeURIComponent(invite)}`).catch(() => null);
    const report = (gag: 'scam' | 'twin') => {
      if (intro) api(`/intro/${encodeURIComponent(intro.code)}/gag`, { body: { gag } }).catch(() => {});
    };
    const install = () => (isIOS && !isStandalone ? installScreen() : loginScreen());
    // Second gag: the look-alikes get greeted as each other (only from their personal QR)
    const twin = () => {
      if (intro?.decoy && !isStandalone && !twinSeen()) {
        report('twin');
        return twinScreen(app, intro.name, intro.decoy.name, install);
      }
      install();
    };
    // First gag: the fake scam e-mail, once per device, only in the browser
    const scamOn = intro ? intro.scamGag : cfg.scamGag;
    if (scamOn && !isStandalone && !gagSeen()) return gagScreen(app, twin, intro ? () => report('scam') : undefined);
    return twin();
  }
  try {
    await loadMe();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      store.token = '';
      return loginScreen();
    }
    // offline with no cache yet: keep the login, show what we can
    return route();
  }
  // Keep the subscription fresh on every launch (iOS sometimes rotates it)
  if (pushSupported && Notification.permission === 'granted') subscribePush().catch(() => {});
  if (pushSupported && Notification.permission === 'default' && (!isIOS || isStandalone)) return storyScreen();
  route();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW failed', e));
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate') {
      const url = new URL(e.data.url, location.origin);
      location.hash = url.hash || '#/';
    }
    if (e.data?.type === 'push') {
      const d = e.data.data || {};
      banner(d.title || 'INCOMING', d.body || '');
      softRefresh();
    }
  });
}

boot();
