import { STORAGE_KEY } from './constants';

export function loadLocal() {
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    return d ? JSON.parse(d) : null;
  } catch {
    return null;
  }
}

export function saveLocal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error(e);
  }
}
