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

export interface AiTaskState {
  kind: AiTaskKind;
  status: AiTaskStatus;
  title: string;
  bankName: string;
  topic: string;
  sourceIds: string[];
  sourceUrls: string[];
  sourceTitles: string[];
  expectedQuestions: number;
  generatedBankId?: string;
  lastError?: string;
  updatedAt: number;
}

export interface AiWorkspaceState {
  messages: AiChatMessage[];
  task: AiTaskState;
}

const KEY = 'ai_workspace_v1';

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
    expectedQuestions: 20,
    updatedAt: Date.now(),
  };
}

export function emptyAiWorkspace(): AiWorkspaceState {
  return { messages: [], task: emptyTask() };
}

export function loadAiWorkspace(): AiWorkspaceState {
  try {
    const raw = db.setting(KEY, '');
    if (!raw) return emptyAiWorkspace();
    const parsed = JSON.parse(raw) as AiWorkspaceState;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-60) : [],
      task: { ...emptyTask(), ...(parsed.task || {}), updatedAt: Number(parsed.task?.updatedAt) || Date.now() },
    };
  } catch {
    return emptyAiWorkspace();
  }
}

export function saveAiWorkspace(state: AiWorkspaceState): AiWorkspaceState {
  const clean: AiWorkspaceState = {
    messages: state.messages.slice(-60),
    task: { ...state.task, updatedAt: Date.now() },
  };
  db.setSetting(KEY, JSON.stringify(clean));
  return clean;
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
