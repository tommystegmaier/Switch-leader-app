/** Per-device dark-mode preference (remembered in localStorage). */
const KEY = 'th-dark';

export function getDark(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setDarkPref(v: boolean): void {
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
}
