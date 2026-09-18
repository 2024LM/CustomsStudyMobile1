export type Page =
  | 'HOME'
  | 'QUESTIONS'
  | 'SESSION'
  | 'REFERENCES'
  | 'MISTAKES'
  | 'FAVORITES'
  | 'BANKS'
  | 'SETTINGS'
  | 'MORE';

export interface QuestionBank {
  id: string;
  name: string;
  description: string;
  version: number;
  formatVersion: number;
  builtIn: boolean;
  enabled: boolean;
  importedAt: number;
  sourceName: string;
}

export interface QuizQuestion {
  rowId: number;
  bankId: string;
  externalId: string;
  question: string;
  correctAnswer: string;
  wrong1: string;
  wrong2: string;
  wrong3: string;
  explanation: string;
  topic: string;
  sourceDate: string;
  questionType: 'QCM' | 'OPEN' | 'ORAL';
  qcmStatus: 'NOT_READY' | 'DRAFT' | 'READY';
  enabled: boolean;
}

export interface Attempt {
  id: number;
  questionRowId: number;
  selectedAnswer: string;
  isCorrect: boolean;
  answeredAt: number;
  sessionId: number | null;
}

export interface QuestionState {
  questionRowId: number;
  favorite: boolean;
  timesSeen: number;
  correctCount: number;
  wrongCount: number;
  streak: number;
  lastAnsweredAt: number | null;
  nextReviewAt: number | null;
}

export interface StudySession {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  requestedCount: number;
  answeredCount: number;
  correctCount: number;
  mode: string;
  bankId: string;
  questionRowIds: number[];
}

export interface StudyStats {
  answered: number;
  correct: number;
  wrong: number;
  favorites: number;
  successRate: number;
}

export interface ActivityBucket {
  label: string;
  subLabel?: string;
  total: number;
  correct: number;
  wrong: number;
  timestamp: number;
}

export interface ImportedQuestion {
  externalId: string;
  question: string;
  answer: string;
  wrong1: string;
  wrong2: string;
  wrong3: string;
  explanation: string;
  topic: string;
}

export interface ExcelPreview {
  rows: ImportedQuestion[];
  errors: string[];
  sourceName: string;
  valid: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'update' | 'alert' | 'general';
  date?: string;
  url?: string;
  read?: boolean;
}

export interface StoredNotification extends AppNotification {
  receivedAt: number;
  readAt: number | null;
  source: 'github' | 'local';
}

export interface RemoteState {
  latest: number;
  minimum: number;
  updateUrl: string;
  updateTitle: string;
  updateMessage: string;
  announcementId: string;
  announcementTitle: string;
  announcementMessage: string;
  announcementEnabled: boolean;
  notifications?: AppNotification[];
  lastCheckedAt?: number;
  source?: 'github' | 'local';
}
