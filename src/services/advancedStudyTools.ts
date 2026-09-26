import { db } from './db';

export interface FlashcardItem {
  id: string;
  questionRowId?: number;
  front: string;
  back: string;
  createdAt: number;
  nextReviewAt: number;
  intervalDays: number;
}

export interface GlossaryItem {
  id: string;
  term: string;
  definition: string;
  createdAt: number;
}

export interface GeneralNote {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = db.setting(key, '');
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  db.setSetting(key, JSON.stringify(value));
}

export function flashcards(): FlashcardItem[] {
  return readJson<FlashcardItem[]>('flashcards_v1', []).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}

export function addFlashcard(front: string, back: string, questionRowId?: number): FlashcardItem {
  const cleanFront = front.trim().slice(0, 3000);
  const cleanBack = back.trim().slice(0, 3000);
  if (!cleanFront || !cleanBack) throw new Error('وجها البطاقة مطلوبان');

  const all = flashcards();
  if (questionRowId && all.some((item) => item.questionRowId === questionRowId)) {
    throw new Error('هذا السؤال موجود بالفعل ضمن البطاقات');
  }

  const item: FlashcardItem = {
    id: 'fc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    questionRowId,
    front: cleanFront,
    back: cleanBack,
    createdAt: Date.now(),
    nextReviewAt: Date.now(),
    intervalDays: 0,
  };
  all.push(item);
  writeJson('flashcards_v1', all);
  return item;
}

export function deleteFlashcard(id: string) {
  writeJson('flashcards_v1', flashcards().filter((item) => item.id !== id));
}

export function gradeFlashcard(id: string, grade: 'again' | 'hard' | 'good' | 'easy') {
  const all = flashcards();
  const item = all.find((card) => card.id === id);
  if (!item) return;

  const current = Math.max(item.intervalDays || 0, 0);
  const nextDays = grade === 'again'
    ? 0
    : grade === 'hard'
      ? Math.max(1, Math.round(current * 1.3) || 1)
      : grade === 'good'
        ? Math.max(2, Math.round(current * 2.2) || 2)
        : Math.max(4, Math.round(current * 3.2) || 4);

  item.intervalDays = nextDays;
  item.nextReviewAt = grade === 'again'
    ? Date.now() + 10 * 60 * 1000
    : Date.now() + nextDays * 24 * 60 * 60 * 1000;
  writeJson('flashcards_v1', all);
}

export function dueFlashcards(): FlashcardItem[] {
  const now = Date.now();
  return flashcards().filter((item) => item.nextReviewAt <= now);
}

export function glossaryItems(): GlossaryItem[] {
  return readJson<GlossaryItem[]>('glossary_v1', []).sort((a, b) => a.term.localeCompare(b.term, 'ar'));
}

export function addGlossaryItem(term: string, definition: string): GlossaryItem {
  const cleanTerm = term.trim().slice(0, 160);
  const cleanDefinition = definition.trim().slice(0, 3000);
  if (!cleanTerm || !cleanDefinition) throw new Error('المصطلح والتعريف مطلوبان');
  const all = glossaryItems();
  const existing = all.find((item) => item.term.toLocaleLowerCase('ar') === cleanTerm.toLocaleLowerCase('ar'));
  if (existing) {
    existing.definition = cleanDefinition;
    writeJson('glossary_v1', all);
    return existing;
  }
  const item: GlossaryItem = {
    id: 'term_' + Date.now().toString(36),
    term: cleanTerm,
    definition: cleanDefinition,
    createdAt: Date.now(),
  };
  all.push(item);
  writeJson('glossary_v1', all);
  return item;
}

export function deleteGlossaryItem(id: string) {
  writeJson('glossary_v1', glossaryItems().filter((item) => item.id !== id));
}

export function generalNotes(): GeneralNote[] {
  return readJson<GeneralNote[]>('general_notes_v1', []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveGeneralNote(note: { id?: string; title: string; body: string }): GeneralNote {
  const title = note.title.trim().slice(0, 200);
  const body = note.body.trim().slice(0, 10000);
  if (!title || !body) throw new Error('العنوان والملاحظة مطلوبان');
  const all = generalNotes();
  const existing = note.id ? all.find((item) => item.id === note.id) : undefined;
  const now = Date.now();
  if (existing) {
    existing.title = title;
    existing.body = body;
    existing.updatedAt = now;
    writeJson('general_notes_v1', all);
    return existing;
  }
  const item: GeneralNote = {
    id: 'note_' + now.toString(36),
    title,
    body,
    createdAt: now,
    updatedAt: now,
  };
  all.push(item);
  writeJson('general_notes_v1', all);
  return item;
}

export function deleteGeneralNote(id: string) {
  writeJson('general_notes_v1', generalNotes().filter((item) => item.id !== id));
}

export function recordFocusMinutes(minutes: number) {
  const safe = Math.max(1, Math.min(Math.round(minutes), 360));
  const history = readJson<Array<{ at: number; minutes: number }>>('focus_history_v1', []);
  history.push({ at: Date.now(), minutes: safe });
  writeJson('focus_history_v1', history.slice(-1000));
}

export function focusMinutesToday(): number {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  return readJson<Array<{ at: number; minutes: number }>>('focus_history_v1', [])
    .filter((entry) => {
      const date = new Date(entry.at);
      return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
    })
    .reduce((sum, entry) => sum + entry.minutes, 0);
}
