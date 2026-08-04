/** Per-device dark-mode preference (remembered in localStorage). */
import { useSyncExternalStore } from 'react';

const KEY = 'th-dark';

type Listener = () => void;
const listeners = new Set<Listener>();

export function getDark(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setDarkPref(v: boolean): void {
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
  // Notify subscribers so components that compute colors in JS (button/divider
  // lifts, roster headers) re-render immediately on toggle — CSS-variable
  // colors already update on their own, but these don't without a re-render.
  listeners.forEach((l) => l());
}

/** Subscribe to dark-mode changes; returns an unsubscribe fn. */
export function subscribeDark(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * React hook: current dark-mode state, reactive to toggles anywhere in the app.
 * Use this (not getDark()) inside components whose rendered colors depend on it.
 */
export function useDark(): boolean {
  return useSyncExternalStore(subscribeDark, getDark, () => false);
}
