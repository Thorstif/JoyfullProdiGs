export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);

export function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeLeft(iso: string) {
  const s = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 0) return 'expired';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m left` : `${m}:${String(sec).padStart(2, '0')} left`;
}

export function toast(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3200);
}

// Big full-width stinger, shown when a push arrives while the app is open
export function banner(title: string, body: string) {
  const el = document.createElement('div');
  el.className = 'stinger';
  el.innerHTML = `<div><h1>${esc(title)}</h1><p>${esc(body)}</p></div>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2000);
  setTimeout(() => el.remove(), 2500);
}
