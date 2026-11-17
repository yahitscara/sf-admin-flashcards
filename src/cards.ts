// Card schema, validation, and loading (manifest files + local decks).

export const OBJECTIVES = [
  { key: 'config-setup', label: 'Configuration & Setup', weight: 15 },
  { key: 'data-analytics', label: 'Data & Analytics', weight: 17 },
  { key: 'productivity', label: 'Productivity & Collaboration', weight: 10 },
  { key: 'service', label: 'Service', weight: 10 },
  { key: 'object-manager', label: 'Object Manager & App Builder', weight: 15 },
  { key: 'sales-marketing', label: 'Sales & Marketing', weight: 10 },
  { key: 'automation', label: 'Automation', weight: 15 },
  { key: 'agentforce', label: 'Agentforce AI', weight: 8 },
] as const;

export type ObjectiveKey = (typeof OBJECTIVES)[number]['key'];
export type CardType = 'question' | 'concept' | 'objective';
const CARD_TYPES: CardType[] = ['question', 'concept', 'objective'];
const OBJECTIVE_KEYS = OBJECTIVES.map((o) => o.key) as string[];

export interface Card {
  id: string;
  type: CardType;
  objective: ObjectiveKey;
  prompt: string;
  options?: string[];
  answer: string[];
  why: string;
  traps?: string;
  strip?: string;
  tags: string[];
  missed: boolean;
  links?: string[];
  translate?: Translate; // "plain English" breakdown, written for missed questions
  source: string; // which deck it came from
}

export interface Translate {
  situation?: string;
  feature?: string;
  see?: string;
  notOther?: string;
}

export interface Deck {
  source: string;
  title: string;
  note?: string;
  cards: Card[];
  local?: boolean; // true when it came from the Import screen
}

export function objectiveLabel(key: string): string {
  return OBJECTIVES.find((o) => o.key === key)?.label ?? key;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function readTranslate(v: unknown): Translate | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const t = v as Record<string, unknown>;
  const out: Translate = {};
  for (const k of ['situation', 'feature', 'see', 'notOther'] as const) if (isStr(t[k])) out[k] = t[k] as string;
  return Object.keys(out).length ? out : undefined;
}

/** Validate one card. Returns the card or a reason it was rejected. */
function validateCard(raw: unknown, source: string): Card | string {
  if (!raw || typeof raw !== 'object') return 'not an object';
  const c = raw as Record<string, unknown>;
  const id = isStr(c.id) ? c.id : '(no id)';
  if (!isStr(c.id)) return 'missing id';
  if (!CARD_TYPES.includes(c.type as CardType)) return `${id}: bad type "${String(c.type)}"`;
  if (!OBJECTIVE_KEYS.includes(c.objective as string)) return `${id}: unknown objective "${String(c.objective)}"`;
  if (!isStr(c.prompt)) return `${id}: missing prompt`;
  // Be lenient: accept a single string answer.
  const answer = typeof c.answer === 'string' ? [c.answer] : c.answer;
  if (!isStrArr(answer) || answer.length === 0) return `${id}: missing answer`;
  if (!isStr(c.why)) return `${id}: missing why`;
  let options: string[] | undefined;
  if (c.options !== undefined) {
    if (!isStrArr(c.options) || c.options.length < 2) return `${id}: options must be an array of 2+ strings`;
    options = c.options;
    const missing = answer.filter((a) => !options!.includes(a));
    if (missing.length) {
      // Can't grade it in Quiz, but it still works as a flashcard.
      console.warn(`[cards] ${id}: answer not found in options, dropping options`, missing);
      options = undefined;
    }
  }
  return {
    id: c.id,
    type: c.type as CardType,
    objective: c.objective as ObjectiveKey,
    prompt: c.prompt,
    options,
    answer,
    why: c.why,
    traps: isStr(c.traps) ? c.traps : undefined,
    strip: isStr(c.strip) ? c.strip : undefined,
    tags: isStrArr(c.tags) ? c.tags : [],
    missed: c.missed === true,
    links: isStrArr(c.links) && c.links.length ? c.links : undefined,
    translate: readTranslate(c.translate),
    source,
  };
}

export interface ValidationResult {
  deck: Deck | null;
  skipped: string[]; // reasons for skipped cards (or the whole file)
}

/** Validate a whole deck file. Bad cards are skipped with a warning, never thrown. */
export function validateDeck(raw: unknown, origin: string): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { deck: null, skipped: [`${origin}: file must be a JSON object with "source" and "cards"`] };
  }
  const d = raw as Record<string, unknown>;
  if (!isStr(d.source)) return { deck: null, skipped: [`${origin}: missing "source"`] };
  if (!Array.isArray(d.cards)) return { deck: null, skipped: [`${origin}: missing "cards" array`] };
  const skipped: string[] = [];
  const cards: Card[] = [];
  d.cards.forEach((rc, i) => {
    const r = validateCard(rc, d.source as string);
    if (typeof r === 'string') {
      const msg = `${origin} card #${i + 1}: ${r}`;
      console.warn('[cards] skipped', msg);
      skipped.push(msg);
    } else cards.push(r);
  });
  return {
    deck: {
      source: d.source,
      title: isStr(d.title) ? d.title : d.source,
      note: isStr(d.note) ? d.note : undefined,
      cards,
    },
    skipped,
  };
}

// ---------- local decks (Import screen) ----------

const LOCAL_KEY = 'sfa.localDecks';

export function loadLocalDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    return arr
      .map((d) => validateDeck(d, 'local deck').deck)
      .filter((d): d is Deck => !!d)
      .map((d) => ({ ...d, local: true }));
  } catch (e) {
    console.warn('[cards] could not read local decks', e);
    return [];
  }
}

export function saveLocalDecks(decks: Deck[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(decks.map(deckToJson)));
  } catch (e) {
    console.warn('[cards] could not save local decks', e);
    throw new Error('Could not save to this browser (storage blocked or full).');
  }
}

/** Convert back to the on-disk file format (drops the computed `source` per card). */
export function deckToJson(d: Deck): object {
  return {
    source: d.source,
    title: d.title,
    ...(d.note ? { note: d.note } : {}),
    cards: d.cards.map(({ source: _s, ...c }) => {
      const out: Record<string, unknown> = { ...c };
      if (!out.options) delete out.options;
      if (!out.traps) delete out.traps;
      if (!out.strip) delete out.strip;
      if (!(out.tags as string[]).length) delete out.tags;
      if (!out.missed) delete out.missed;
      if (!out.links) delete out.links;
      if (!out.translate) delete out.translate;
      return out;
    }),
  };
}

// ---------- loading everything ----------

export interface Library {
  decks: Deck[];
  cards: Card[]; // merged, later decks win on duplicate id
  warnings: string[];
}

export async function loadLibrary(): Promise<Library> {
  const warnings: string[] = [];
  const decks: Deck[] = [];
  try {
    const res = await fetch('data/manifest.json', { cache: 'no-cache' });
    const manifest = (await res.json()) as { files?: unknown };
    const files = isStrArr(manifest.files) ? manifest.files : [];
    const results = await Promise.all(
      files.map(async (f) => {
        try {
          const r = await fetch(`data/${f}`, { cache: 'no-cache' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return validateDeck(await r.json(), f);
        } catch (e) {
          const msg = `${f}: could not load (${(e as Error).message})`;
          console.warn('[cards]', msg);
          return { deck: null, skipped: [msg] } as ValidationResult;
        }
      }),
    );
    for (const r of results) {
      warnings.push(...r.skipped);
      if (r.deck) decks.push(r.deck);
    }
  } catch (e) {
    warnings.push(`manifest.json could not be loaded (${(e as Error).message})`);
  }
  decks.push(...loadLocalDecks());
  const { cards, duplicates } = mergeDecks(decks);
  if (duplicates.length) warnings.push(`Duplicate ids (newer card used): ${duplicates.join(', ')}`);
  return { decks, cards, warnings };
}

export function mergeDecks(decks: Deck[]): { cards: Card[]; duplicates: string[] } {
  const map = new Map<string, Card>();
  const duplicates: string[] = [];
  for (const d of decks) {
    for (const c of d.cards) {
      if (map.has(c.id)) duplicates.push(c.id);
      map.set(c.id, c);
    }
  }
  return { cards: [...map.values()], duplicates };
}
