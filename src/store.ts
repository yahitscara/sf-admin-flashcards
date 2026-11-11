// Study progress + filter state, kept in localStorage (per device, no login).
import type { Card } from './cards';

export type Mark = 'got' | 'unsure' | 'missed';

const PROGRESS_KEY = 'sfa.progress';
const FILTER_KEY = 'sfa.filters';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[store] could not save', key, e);
  }
}

// ---------- progress ----------

let progress: Record<string, Mark> = read(PROGRESS_KEY, {});

export const getMark = (id: string): Mark | undefined => progress[id];

export function setMark(id: string, mark: Mark): void {
  progress[id] = mark;
  write(PROGRESS_KEY, progress);
}

export function resetProgress(): void {
  progress = {};
  write(PROGRESS_KEY, progress);
}

/** Weak spots: marked Missed/Unsure, or flagged missed on the exam and not yet marked Got it. */
export function isWeak(c: Card): boolean {
  const m = progress[c.id];
  return m === 'missed' || m === 'unsure' || (c.missed && m !== 'got');
}

// ---------- filters ----------

export interface Filters {
  objective: string;
  source: string;
  type: string;
  tag: string;
  search: string;
}
export const EMPTY_FILTERS: Filters = { objective: '', source: '', type: '', tag: '', search: '' };

export let filters: Filters = { ...EMPTY_FILTERS, ...read<Partial<Filters>>(FILTER_KEY, {}) };

export function setFilters(next: Partial<Filters>): void {
  filters = { ...filters, ...next };
  write(FILTER_KEY, filters);
}

export function applyFilters(cards: Card[], f: Filters = filters): Card[] {
  const q = f.search.trim().toLowerCase();
  return cards.filter(
    (c) =>
      (!f.objective || c.objective === f.objective) &&
      (!f.source || c.source === f.source) &&
      (!f.type || c.type === f.type) &&
      (!f.tag || c.tags.includes(f.tag)) &&
      (!q || c.prompt.toLowerCase().includes(q) || c.why.toLowerCase().includes(q) ||
        c.answer.some((a) => a.toLowerCase().includes(q))),
  );
}

export const filtersActive = (f: Filters = filters): boolean =>
  Object.values(f).some((v) => v !== '');
