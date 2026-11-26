import { api } from './api.ts';
import { esc, ago, toast, timeLeft } from './ui.ts';

// The hidden Game Master panel. Every form posts its fields to the path in data-api.

export async function renderGm(v: HTMLElement, refresh: () => void) {
  const s = await api<any>('/gm/state', { gm: true });
  const opts = (blank: string) =>
    `${blank ? `<option value="">${blank}</option>` : ''}${s.players.map((p: any) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}`;
  const set = s.settings;
  const optsSel = (blank: string, cur: string) =>
    `<option value="">${blank}</option>${s.players.map((p: any) => `<option value="${p.id}" ${String(p.id) === String(cur) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`;

  v.innerHTML = `
    <h2 class="gm-title">GAME MASTER</h2>

    <section class="card">
      <h3>Claims to review (${s.claims.length})</h3>
      ${
        s.claims
          .map(
            (c: any) => `<div class="gm-item">
          <b>${esc(c.player)}</b> · ${esc(c.mission)} · +${c.awarded}<br/>
          ${c.note ? `<i>“${esc(c.note)}”</i><br/>` : ''}<small class="muted">${ago(c.created_at)}</small>
          <div class="row"><button class="btn small primary" data-post="/gm/claims/${c.id}" data-body='{"approve":true}'>Approve</button>
          <button class="btn small ghost" data-post="/gm/claims/${c.id}" data-body='{"approve":false}'>Reject</button></div>
        </div>`,
          )
          .join('') || '<p class="muted">All clear.</p>'
      }
    </section>

    ${
      s.bounties.some((b: any) => b.status === 'claimed')
        ? `<section class="card"><h3>Bounty disputes</h3>
      ${s.bounties
        .filter((b: any) => b.status === 'claimed')
        .map(
          (b: any) => `<div class="gm-item">${esc(b.claimant_name)} claims ${b.stake} from ${esc(b.issuer_name)}: ${esc(b.title)}
          <div class="row"><button class="btn small" data-post="/gm/bounties/${b.id}/settle" data-body='{"pay":true}'>Force pay</button>
          <button class="btn small ghost" data-post="/gm/bounties/${b.id}/settle" data-body='{"pay":false}'>Reject claim</button></div></div>`,
        )
        .join('')}</section>`
        : ''
    }

    ${
      !s.tripStarted
        ? `<button class="btn primary huge" data-post="/gm/start" data-confirm="1">START THE GAME</button>
           <p class="small muted">Turns on autopilot and sends everyone a short GAME ON.</p>`
        : set.sched_enabled === '1'
          ? `<button class="btn ghost wide" data-post="/gm/pause" data-body='{"paused":true}'>⏸ Pause autopilot</button>`
          : `<button class="btn primary wide" data-post="/gm/pause" data-body='{"paused":false}'>▶ Resume autopilot</button>`
    }

    <section class="card">
      <h3>Quick actions</h3>
      <form class="row" data-api="/gm/double">
        <input name="minutes" type="number" value="30" min="1" class="num" /> <button class="btn primary">Start 2X Respect</button>
      </form>
      ${s.doubleUntil ? `<p>2X live, <span data-until="${s.doubleUntil}">${timeLeft(s.doubleUntil)}</span> <button class="btn small ghost" data-delete="/gm/double">Stop</button></p>` : ''}
      <div class="row wrap">
        <button class="btn" data-post="/gm/drop">Random side mission now</button>
        <button class="btn" data-post="/gm/recap">Send daily recap</button>
        <button class="btn" data-post="/gm/test-push">Test push to all</button>
        <button class="btn danger" data-post="/gm/final" data-confirm="Send FINAL STANDINGS to everyone?">Final standings</button>
      </div>
    </section>

    <details class="card" open>
      <summary>Create mission</summary>
      <form class="stack" data-api="/gm/missions">
        <input name="title" placeholder="Title" required />
        <textarea name="description" placeholder="Briefing"></textarea>
        <div class="row">
          <label>Reward <input name="reward" type="number" value="50" class="num" /></label>
          <label>Minutes <input name="expiresInMinutes" type="number" placeholder="none" class="num" /></label>
          <label>Winners <input name="maxWinners" type="number" value="1" min="0" class="num" /></label>
        </div>
        <div class="row">
          <select name="kind"><option value="gm">Mission</option><option value="side">Side mission</option><option value="world">World event</option><option value="mystery">Mystery (secret)</option></select>
          <select name="targetPlayerId">${opts('Everyone')}</select>
        </div>
        <small class="muted">Winners 0 = everyone who does it gets paid. Pick a player to make it a secret job only they see.</small>
        <label class="check"><input type="checkbox" name="notify" checked /> Send push</label>
        <button class="btn primary">Launch</button>
      </form>
    </details>

    <details class="card">
      <summary>World event broadcast</summary>
      <form class="stack" data-api="/gm/world">
        <input name="title" placeholder="e.g. POLICE CHECKPOINT" required />
        <textarea name="body" placeholder="What is happening in the city" required></textarea>
        <button class="btn primary">Broadcast to all</button>
      </form>
    </details>

    <details class="card">
      <summary>Secret message to one player</summary>
      <form class="stack" data-api="/gm/dm">
        <select name="playerId">${opts('')}</select>
        <input name="title" placeholder="INCOMING CALL" />
        <textarea name="body" placeholder="Message" required></textarea>
        <button class="btn primary">Send</button>
      </form>
    </details>

    <details class="card">
      <summary>Give or take Respect</summary>
      <form class="stack" data-api="/gm/respect">
        <div class="row"><select name="playerId">${opts('')}</select><input name="delta" type="number" value="25" class="num" /></div>
        <input name="reason" placeholder="Reason (they will see it)" />
        <label class="check"><input type="checkbox" name="notify" checked /> Notify them</label>
        <button class="btn primary">Apply</button>
      </form>
    </details>

    <details class="card">
      <summary>Award custom achievement</summary>
      <form class="stack" data-api="/gm/achievement">
        <select name="playerId">${opts('')}</select>
        <input name="title" placeholder="e.g. Karaoke Legend" required />
        <input name="description" placeholder="What they did" />
        <button class="btn primary">Award</button>
      </form>
    </details>

    <details class="card">
      <summary>Autopilot (random drops + recap)</summary>
      <form class="stack" data-api="/gm/settings">
        <label class="check"><input type="checkbox" name="sched_enabled" ${set.sched_enabled === '1' ? 'checked' : ''} /> Autopilot on</label>
        <div class="row">
          <label>Active from <input name="sched_active_from" type="number" min="0" max="23" value="${esc(set.sched_active_from)}" class="num" /></label>
          <label>to <input name="sched_active_to" type="number" min="1" max="24" value="${esc(set.sched_active_to)}" class="num" /></label>
        </div>
        <div class="row">
          <label>Gap min <input name="sched_min_gap" type="number" value="${esc(set.sched_min_gap)}" class="num" /></label>
          <label>max <input name="sched_max_gap" type="number" value="${esc(set.sched_max_gap)}" class="num" /></label>
        </div>
        <div class="row">
          <label>Open for (min) <input name="sched_side_expiry" type="number" value="${esc(set.sched_side_expiry)}" class="num" /></label>
          <label>Winners <input name="side_max_winners" type="number" value="${esc(set.side_max_winners)}" class="num" /></label>
        </div>
        <label>Mystery chance (0 to 1) <input name="sched_mystery_chance" value="${esc(set.sched_mystery_chance)}" class="num" /></label>
        <div class="row">
          <label class="check"><input type="checkbox" name="recap_enabled" ${set.recap_enabled === '1' ? 'checked' : ''} /> Daily recap at</label>
          <input name="recap_hour" type="number" min="0" max="23" value="${esc(set.recap_hour)}" class="num" />
        </div>
        <label>Auto final standings at <input name="final_scheduled_at" type="datetime-local" value="${toLocalInput(set.final_scheduled_at)}" /></label>
        ${s.nextDropAt && set.sched_enabled === '1' ? `<p class="small muted">Next random drop around ${new Date(s.nextDropAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>` : ''}
        <label>Time zone <input name="tz" value="${esc(set.tz)}" placeholder="Europe/Oslo" /></label>
        <label>Auto-approve claims after (min, 0 = off) <input name="auto_approve_min" type="number" min="0" value="${esc(set.auto_approve_min)}" class="num" /></label>
        <label>Crown cooldown per person (min) <input name="crown_cooldown_min" type="number" min="0" value="${esc(set.crown_cooldown_min)}" class="num" /></label>
        <button class="btn primary">Save</button>
      </form>
    </details>

    <details class="card">
      <summary>Mission pool (${s.pool.length})</summary>
      <form class="stack" data-api="/gm/pool">
        <input name="title" placeholder="Title" required />
        <textarea name="description" placeholder="Briefing"></textarea>
        <div class="row"><select name="kind"><option value="side">Side (everyone)</option><option value="mystery">Mystery (one random player)</option></select><input name="reward" type="number" value="30" class="num" /></div>
        <button class="btn">Add to pool</button>
      </form>
      <ul class="pool">${s.pool
        .map(
          (p: any) =>
            `<li><span class="pill ${p.kind === 'mystery' ? 'pending' : ''}">${p.kind}</span> ${esc(p.title)} <small class="muted">+${p.reward} · used ${p.used}</small> <button class="link" data-delete="/gm/pool/${p.id}">remove</button></li>`,
        )
        .join('')}</ul>
    </details>

    <details class="card">
      <summary>Recent missions</summary>
      <ul class="pool">${s.missions
        .map(
          (m: any) =>
            `<li><span class="pill ${m.open ? 'approved' : 'closed'}">${m.open ? 'open' : 'closed'}</span> ${esc(m.title)} <small class="muted">${m.kind}${m.target_name ? ` · for ${esc(m.target_name)}` : ''} · ${m.winners} paid</small>
            ${m.open ? `<button class="link" data-post="/gm/missions/${m.id}/close">close</button>` : ''}</li>`,
        )
        .join('')}</ul>
    </details>

    <details class="card">
      <summary>Crown from "the city" (anonymous)</summary>
      <form class="stack" data-api="/gm/crown">
        <select name="toId">${opts('')}</select>
        <input name="reason" placeholder="Reason everyone will see" required />
        <select name="bonus"><option value="0">No Respect</option><option value="10">+10</option><option value="25">+25</option><option value="50">+50</option></select>
        <button class="btn primary">Crown them</button>
      </form>
    </details>

    <details class="card">
      <summary>Gags</summary>
      <form class="stack" data-api="/gm/settings">
        <label class="check"><input type="checkbox" name="scam_gag" ${set.scam_gag !== '0' ? 'checked' : ''} /> Fake scam e-mail on first open</label>
        <p class="small muted">Mistaken identity: when these two scan their card, the app greets them as the other guy, then corrects itself.</p>
        <div class="row">
          <select name="twin_a">${optsSel('Nobody', set.twin_a)}</select>
          <select name="twin_b">${optsSel('Nobody', set.twin_b)}</select>
        </div>
        <button class="btn primary">Save</button>
      </form>
    </details>

    <section class="card">
      <h3>QR cards</h3>
      <p class="small muted">One personal QR per player. Open this on the server's real address so the links point there. Every card carries its owner's own name.</p>
      <button class="btn" id="qr-open">Show printable QR cards</button>
    </section>

    <details class="card">
      <summary>Players and invite codes</summary>
      <table class="codes">
        <tr><th>Name</th><th>Code</th><th>Phones</th><th>Seen</th><th></th></tr>
        ${s.players
          .map(
            (p: any) => `<tr class="${p.devices ? '' : 'warn-row'}"><td>${esc(p.name)}${p.is_gm ? ' ★' : ''}</td><td><code>${esc(p.code)}</code></td><td>${p.devices || '⚠ 0'}</td><td>${p.last_seen ? ago(p.last_seen) : '–'}</td>
            <td class="acts"><button class="link" data-post="/gm/test-push" data-body='{"playerId":${p.id}}'>ping</button>
            <button class="link" data-copy="${esc(s.baseUrl)}/?invite=${encodeURIComponent(p.code)}">link</button>
            <button class="link" data-post="/gm/players/${p.id}/reissue" data-confirm="1">new code</button>
            <button class="link" data-aliases="${p.id}" data-name="${esc(p.name)}" data-cur="${esc(aliasList(p.aliases).join(', '))}">tag</button></td></tr>`,
          )
          .join('')}
      </table>
      <p class="small muted">"tag" sets the wrong names their nametag now and then slips to.</p>
      <p class="small muted">⚠ 0 phones = no alerts reach them. "link" copies their personal invite to paste in a chat if a card is lost. "new code" if a card leaks: old code and phones stop working.</p>
      <button class="btn small ghost" data-post="/gm/backup">Back up now</button>
    </details>

    <details class="card">
      <summary>Reset game (after testing)</summary>
      <p class="small muted">Wipes Respect, jobs, claims, bounties, crown, achievements and the news feed, and puts the game back to "not started". Keeps players, invite codes, logins, phones and alerts, nametags and settings. A backup is saved first.</p>
      <button class="btn danger" id="reset-game">Reset game</button>
    </details>`;

  document.getElementById('qr-open')!.onclick = async () => {
    try {
      const cards = await api<any[]>('/gm/qr', { gm: true });
      showQrSheet(cards);
    } catch (err: any) {
      toast(err.message);
    }
  };

  document.getElementById('reset-game')!.onclick = async () => {
    const val = prompt('This wipes all scores and events. Type RESET to confirm.');
    if (val === null) return;
    try {
      await api('/gm/reset', { body: { confirm: val.trim().toUpperCase() }, gm: true });
      for (const k of Object.keys(localStorage)) if (k.startsWith('ww_cache:')) localStorage.removeItem(k);
      toast('Game reset. Press Start when you kick off.');
      refresh();
    } catch (err: any) {
      toast(err.message);
    }
  };

  v.querySelectorAll<HTMLElement>('[data-aliases]').forEach((b) => {
    b.onclick = async () => {
      const val = prompt(`Wrong names for ${b.dataset.name}'s nametag (comma separated, empty = none):`, b.dataset.cur || '');
      if (val === null) return;
      try {
        await api(`/gm/players/${b.dataset.aliases}`, { method: 'POST', body: { aliases: val }, gm: true });
        toast('Nametag updated.');
        refresh();
      } catch (err: any) {
        toast(err.message);
      }
    };
  });

  v.querySelectorAll<HTMLElement>('[data-copy]').forEach((b) => {
    b.onclick = async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy!);
        toast('Link copied.');
      } catch {
        toast(b.dataset.copy!);
      }
    };
  });

  // Wire up forms
  v.querySelectorAll<HTMLFormElement>('form[data-api]').forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body: Record<string, unknown> = {};
      f.querySelectorAll<HTMLInputElement>('input, select, textarea').forEach((el) => {
        if (!el.name) return;
        if (el.type === 'checkbox') body[el.name] = el.name.startsWith('sched_') || el.name.startsWith('recap_') || el.name.startsWith('scam_') ? (el.checked ? '1' : '0') : el.checked;
        else if (el.type === 'datetime-local') body[el.name] = el.value ? new Date(el.value).toISOString() : '';
        else body[el.name] = el.value;
      });
      try {
        const r = await api<any>(f.dataset.api!, { body, gm: true });
        toast(r && typeof r.sent === 'number' ? `Sent to ${r.sent} phone(s)${r.failed ? `, ${r.failed} failed` : ''}.` : 'Done.');
        refresh();
      } catch (err: any) {
        toast(err.message);
      }
    };
  });
  v.querySelectorAll<HTMLElement>('[data-post], [data-delete]').forEach((b) => {
    b.onclick = async () => {
      if (b.dataset.confirm && !b.classList.contains('armed')) {
        // two-tap confirm instead of a blocking dialog
        b.classList.add('armed');
        b.textContent = 'Tap again to confirm';
        setTimeout(() => refresh(), 4000);
        return;
      }
      try {
        const r = await api<any>(b.dataset.post || b.dataset.delete!, {
          method: b.dataset.delete ? 'DELETE' : 'POST',
          body: b.dataset.body ? JSON.parse(b.dataset.body) : {},
          gm: true,
        });
        toast(r && typeof r.sent === 'number' ? `Sent to ${r.sent} phone(s)${r.failed ? `, ${r.failed} failed` : ''}.` : r?.code ? `New code: ${r.code}` : r?.text || 'Done.');
        refresh();
      } catch (err: any) {
        toast(err.message);
      }
    };
  });
}

function toLocalInput(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Full-screen printable sheet of QR cards. SVGs come from our own server (qrcode library).
function showQrSheet(cards: { name: string; url: string; svg: string }[]) {
  const el = document.createElement('div');
  el.className = 'qr-sheet';
  el.innerHTML = `
    <div class="qr-tools"><button class="btn primary" id="qr-print">Print</button><button class="btn ghost" id="qr-close">Close</button></div>
    <div class="qr-grid">
      ${cards
        .map(
          (c) => `<div class="qr-card">
          <div class="qr-title">JoyfullProdiGs</div>
          <div class="qr-svg">${c.svg}</div>
          <div class="qr-name">${esc(c.name)}</div>
          <div class="qr-fine">Personal invitation. Scan with the iPhone camera.</div>
        </div>`,
        )
        .join('')}
    </div>
    <p class="small qr-note">Give each card to the player named on it. The Jens and Ivar mix-up happens inside the app.</p>`;
  document.body.appendChild(el);
  el.querySelector<HTMLElement>('#qr-close')!.onclick = () => el.remove();
  el.querySelector<HTMLElement>('#qr-print')!.onclick = () => window.print();
}

function aliasList(raw: string | null): string[] {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
