import { db } from './db';

export type AiTaskKind = 'chat' | 'progress' | 'bank' | 'topic' | 'references';
export type AiTaskStatus = 'idle' | 'collecting' | 'ready' | 'generating' | 'review' | 'done' | 'error';

export interface AiMessageAttachment {
  id: string;
  title: string;
  kind: 'image' | 'pdf' | 'file' | 'bank' | 'reference' | 'url';
  mimeType?: string;
}

export interface AiRichContentItem {
  id: string;
  type: 'youtube' | 'image' | 'link';
  title: string;
  url: string;
  subtitle?: string;
  thumbnailUrl?: string;
}

export interface AiRichContentBlock {
  type: 'rich_content';
  title: string;
  beforeText?: string;
  afterText?: string;
  items: AiRichContentItem[];
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: number;
  attachments?: AiMessageAttachment[];
  blocks?: AiRichContentBlock[];
}

export interface AiGeneratedBankQuestion {
  question: string;
  correctAnswer: string;
  wrong1: string;
  wrong2: string;
  wrong3: string;
  explanation: string;
  topic: string;
}

export interface AiTaskState {
  kind: AiTaskKind;
  status: AiTaskStatus;
  title: string;
  bankName: string;
  topic: string;
  sourceIds: string[];
  sourceUrls: string[];
  sourceTitles: string[];
  localSourceTitles: string[];
  expectedQuestions: number;
  generatedQuestions?: AiGeneratedBankQuestion[];
  generatedBankId?: string;
  lastError?: string;
  updatedAt: number;
}

export interface AiWorkspaceState {
  messages: AiChatMessage[];
  task: AiTaskState;
}

export interface AiSessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  active: boolean;
}

interface AiSessionRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspace: AiWorkspaceState;
}

interface AiSessionStore {
  version: 1;
  activeId: string;
  sessions: AiSessionRecord[];
}

const LEGACY_KEY = 'ai_workspace_v1';
const SESSIONS_KEY = 'ai_sessions_v1';
const MAX_SESSIONS = 40;

function emptyTask(): AiTaskState {
  return {
    kind: 'chat',
    status: 'idle',
    title: '',
    bankName: '',
    topic: '',
    sourceIds: [],
    sourceUrls: [],
    sourceTitles: [],
    localSourceTitles: [],
    expectedQuestions: 20,
    generatedQuestions: [],
    updatedAt: Date.now(),
  };
}

export function emptyAiWorkspace(): AiWorkspaceState {
  return { messages: [], task: emptyTask() };
}

function cleanGeneratedQuestions(value: unknown): AiGeneratedBankQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item: any) => ({
    question: String(item?.question || '').trim().slice(0, 2000),
    correctAnswer: String(item?.correctAnswer || '').trim().slice(0, 2000),
    wrong1: String(item?.wrong1 || '').trim().slice(0, 2000),
    wrong2: String(item?.wrong2 || '').trim().slice(0, 2000),
    wrong3: String(item?.wrong3 || '').trim().slice(0, 2000),
    explanation: String(item?.explanation || '').trim().slice(0, 2000),
    topic: String(item?.topic || '').trim().slice(0, 200),
  })).filter((item) => item.question && item.correctAnswer && item.wrong1 && item.wrong2 && item.wrong3);
}

function cleanWorkspace(input?: Partial<AiWorkspaceState> | null): AiWorkspaceState {
  return {
    messages: Array.isArray(input?.messages) ? input!.messages!.slice(-60) : [],
    task: {
      ...emptyTask(),
      ...(input?.task || {}),
      generatedQuestions: cleanGeneratedQuestions(input?.task?.generatedQuestions),
      updatedAt: Number(input?.task?.updatedAt) || Date.now(),
    },
  };
}

function titleFromWorkspace(workspace: AiWorkspaceState): string {
  const firstUser = workspace.messages.find((message) => message.role === 'user' && message.text.trim());
  if (!firstUser) return 'محادثة جديدة';
  const clean = firstUser.text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 46) return clean;
  return clean.slice(0, 46).trimEnd() + '…';
}

function newSession(workspace: AiWorkspaceState = emptyAiWorkspace(), title?: string): AiSessionRecord {
  const now = Date.now();
  return {
    id: 'ais_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    title: title || titleFromWorkspace(workspace),
    createdAt: now,
    updatedAt: now,
    workspace: cleanWorkspace(workspace),
  };
}

function persistStore(store: AiSessionStore): AiSessionStore {
  const clean: AiSessionStore = {
    version: 1,
    activeId: store.activeId,
    sessions: store.sessions
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS),
  };
  if (!clean.sessions.some((session) => session.id === clean.activeId) && clean.sessions[0]) {
    clean.activeId = clean.sessions[0].id;
  }
  db.setSetting(SESSIONS_KEY, JSON.stringify(clean));
  return clean;
}

function loadStore(): AiSessionStore {
  try {
    const raw = db.setting(SESSIONS_KEY, '');
    if (raw) {
      const parsed = JSON.parse(raw) as AiSessionStore;
      const sessions = Array.isArray(parsed.sessions)
        ? parsed.sessions.map((session) => ({
            id: String(session.id || ''),
            title: String(session.title || 'محادثة جديدة').slice(0, 80),
            createdAt: Number(session.createdAt) || Date.now(),
            updatedAt: Number(session.updatedAt) || Date.now(),
            workspace: cleanWorkspace(session.workspace),
          })).filter((session) => session.id)
        : [];
      if (sessions.length) {
        const activeId = sessions.some((session) => session.id === parsed.activeId)
          ? parsed.activeId
          : sessions[0].id;
        return { version: 1, activeId, sessions };
      }
    }
  } catch {}

  // One-time migration from the old single-workspace format.
  try {
    const legacyRaw = db.setting(LEGACY_KEY, '');
    if (legacyRaw) {
      const legacy = cleanWorkspace(JSON.parse(legacyRaw));
      const migrated = newSession(legacy, titleFromWorkspace(legacy));
      return persistStore({ version: 1, activeId: migrated.id, sessions: [migrated] });
    }
  } catch {}

  const first = newSession();
  return persistStore({ version: 1, activeId: first.id, sessions: [first] });
}

export function aiSessionSummaries(): AiSessionSummary[] {
  const store = loadStore();
  return store.sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.workspace.messages.length,
      active: session.id === store.activeId,
    }));
}

export function activeAiSessionId(): string {
  return loadStore().activeId;
}

export function loadAiWorkspace(): AiWorkspaceState {
  const store = loadStore();
  return cleanWorkspace(store.sessions.find((session) => session.id === store.activeId)?.workspace);
}

export function saveAiWorkspace(state: AiWorkspaceState): AiWorkspaceState {
  const store = loadStore();
  const clean = cleanWorkspace(state);
  const now = Date.now();
  const index = store.sessions.findIndex((session) => session.id === store.activeId);

  if (index < 0) {
    const created = newSession(clean);
    store.sessions.unshift(created);
    store.activeId = created.id;
  } else {
    const current = store.sessions[index];
    const shouldAutoTitle = current.title === 'محادثة جديدة' || current.workspace.messages.length === 0;
    store.sessions[index] = {
      ...current,
      title: shouldAutoTitle ? titleFromWorkspace(clean) : current.title,
      updatedAt: now,
      workspace: clean,
    };
  }

  persistStore(store);
  // Keep legacy key synchronized for backward compatibility with older builds.
  db.setSetting(LEGACY_KEY, JSON.stringify(clean));
  return clean;
}

export function createAiSession(): AiWorkspaceState {
  const store = loadStore();
  const created = newSession();
  store.sessions.unshift(created);
  store.activeId = created.id;
  persistStore(store);
  return created.workspace;
}

export function switchAiSession(id: string): AiWorkspaceState {
  const store = loadStore();
  const target = store.sessions.find((session) => session.id === id);
  if (!target) return loadAiWorkspace();
  store.activeId = id;
  target.updatedAt = Date.now();
  persistStore(store);
  return cleanWorkspace(target.workspace);
}

export function deleteAiSession(id: string): AiWorkspaceState {
  const store = loadStore();
  store.sessions = store.sessions.filter((session) => session.id !== id);

  if (!store.sessions.length) {
    const created = newSession();
    store.sessions = [created];
    store.activeId = created.id;
    persistStore(store);
    return created.workspace;
  }

  if (store.activeId === id) {
    store.activeId = store.sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
  }

  persistStore(store);
  return cleanWorkspace(store.sessions.find((session) => session.id === store.activeId)?.workspace);
}

export function renameAiSession(id: string, title: string): void {
  const cleanTitle = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!cleanTitle) return;
  const store = loadStore();
  const target = store.sessions.find((session) => session.id === id);
  if (!target) return;
  target.title = cleanTitle;
  target.updatedAt = Date.now();
  persistStore(store);
}

export function resetAiWorkspace(): AiWorkspaceState {
  const state = emptyAiWorkspace();
  saveAiWorkspace(state);
  return state;
}

export function addAiMessage(
  state: AiWorkspaceState,
  role: AiChatMessage['role'],
  text: string,
  attachments: AiMessageAttachment[] = [],
  blocks: AiRichContentBlock[] = []
): AiWorkspaceState {
  const message: AiChatMessage = {
    id: 'aim_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    role,
    text: text.trim().slice(0, 12000),
    at: Date.now(),
    attachments: attachments.length ? attachments.slice(0, 8) : undefined,
    blocks: blocks.length ? blocks.slice(0, 6) : undefined,
  };
  return saveAiWorkspace({ ...state, messages: [...state.messages, message] });
}
