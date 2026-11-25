const TOKEN_KEY = 'ww_token';
const PIN_KEY = 'ww_gm_pin';

export const store = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  },
  set token(v: string) {
    try {
      v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
  get pin() {
    try {
      return sessionStorage.getItem(PIN_KEY) || '';
    } catch {
      return '';
    }
  },
  set pin(v: string) {
    try {
      v ? sessionStorage.setItem(PIN_KEY, v) : sessionStorage.removeItem(PIN_KEY);
    } catch {}
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; gm?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (store.token) headers.Authorization = `Bearer ${store.token}`;
  if (opts.gm) headers['X-GM-PIN'] = store.pin;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const method = opts.method || (opts.body !== undefined ? 'POST' : 'GET');
  const cacheKey = `ww_cache:${path}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    // No signal: show the last copy we have, so the app still opens on a bad connection
    setOffline(true);
    if (method === 'GET') {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached) as T;
      } catch {}
    }
    throw new ApiError(0, 'No signal. Try again in a bit.');
  }
  setOffline(false);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Error ${res.status}`);
  if (method === 'GET' && !opts.gm) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {}
  }
  return data as T;
}

function setOffline(off: boolean) {
  document.body.classList.toggle('offline', off);
}
