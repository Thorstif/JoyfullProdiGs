// Flags for the first-open joke (the screen itself lives in gagscreen.ts and is only loaded after a valid invite).

const SEEN = 'ww_gag_seen';
const FELL = 'ww_gag_fell';

export const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const put = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export const gagSeen = () => get(SEEN) === '1';
export const fellForGag = () => get(FELL) === '1';
export const clearFell = () => put(FELL, '0');

