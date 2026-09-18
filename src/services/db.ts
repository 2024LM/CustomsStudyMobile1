import initialQuestionsRaw from '../data/questions.json';
import {
  ActivityBucket,
  Attempt,
  ExcelPreview,
  QuestionBank,
  QuestionState,
  QuizQuestion,
  RemoteState,
  StoredNotification,
  StudySession,
  StudyStats,
} from '../types';

const STORAGE_KEY = 'customs_study_data_v3';
export const BUILTIN_BANK = 'customs_ma_2026';

interface RawBuiltInQuestion {
  id: number;
  question: string;
  answer: string;
  wrong1?: string;
  wrong2?: string;
  wrong3?: string;
  explanation?: string;
  topic?: string;
  date?: string;
  type?: string;
  qcmStatus?: string;
}

interface DatabaseSchema {
  banks: QuestionBank[];
  questions: QuizQuestion[];
  attempts: Attempt[];
  questionStates: Record<number, QuestionState>;
  sessions: StudySession[];
  settings: Record<string, string>;
  notifications: StoredNotification[];
}

function createInitialDatabase(): DatabaseSchema {
  const now = Date.now();
  const builtInBank: QuestionBank = {
    id: BUILTIN_BANK,
    name: 'مفتشو الجمارك 2026',
    description: 'بنك الأسئلة الأساسي للتطبيق',
    version: 1,
    formatVersion: 1,
    builtIn: true,
    enabled: true,
    importedAt: now,
    sourceName: 'questions.json',
  };

  const rawList = initialQuestionsRaw as RawBuiltInQuestion[];
  const questions: QuizQuestion[] = rawList.map((raw, idx) => {
    const isOral = raw.type?.toUpperCase() === 'ORAL';
    const hasDistractors = Boolean(raw.wrong1 && raw.wrong2 && raw.wrong3);
    const qType: 'QCM' | 'OPEN' | 'ORAL' = isOral ? 'ORAL' : hasDistractors ? 'QCM' : 'OPEN';
    const qStatus: 'NOT_READY' | 'DRAFT' | 'READY' =
      raw.qcmStatus?.toUpperCase() === 'READY'
        ? 'READY'
        : raw.wrong1
          ? 'DRAFT'
          : 'NOT_READY';

    return {
      rowId: idx + 1,
      bankId: BUILTIN_BANK,
      externalId: String(raw.id),
      question: raw.question || '',
      correctAnswer: raw.answer || '',
      wrong1: raw.wrong1 || '',
      wrong2: raw.wrong2 || '',
      wrong3: raw.wrong3 || '',
      explanation: raw.explanation || '',
      topic: raw.topic || '',
      sourceDate: raw.date || '',
      questionType: qType,
      qcmStatus: qStatus,
      enabled: true,
    };
  });

  const questionStates: Record<number, QuestionState> = {};
  questions.forEach((q) => {
    questionStates[q.rowId] = {
      questionRowId: q.rowId,
      favorite: false,
      timesSeen: 0,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      lastAnsweredAt: null,
      nextReviewAt: null,
    };
  });

  const settings: Record<string, string> = {
    active_bank_id: BUILTIN_BANK,
    daily_goal: '20',
    reminder_hours: '1',
    reminders_enabled: '0',
    remote_latest: '1',
    remote_minimum: '1',
    remote_update_url: '',
    remote_update_title: 'يتوفر تحديث جديد',
    remote_update_message: 'يرجى تحديث التطبيق.',
    remote_announcement_id: '',
    remote_announcement_title: '',
    remote_announcement_message: '',
    remote_announcement_enabled: '0',
    remote_announcement_seen_id: '',
  };

  return {
    banks: [builtInBank],
    questions,
    attempts: [],
    questionStates,
    sessions: [],
    settings,
    notifications: [],
  };
}

class StudyDatabaseService {
  private data: DatabaseSchema;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.data = this.loadFromStorage();
  }

  private loadFromStorage(): DatabaseSchema {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DatabaseSchema;
        if (parsed.banks && parsed.questions && parsed.settings) {
          // If built-in questions need refreshing or were missing
          if (parsed.questions.length === 0) {
            return createInitialDatabase();
          }
          parsed.notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load study database from storage:', e);
    }
    const initial = createInitialDatabase();
    this.saveToStorage(initial);
    return initial;
  }

  private saveToStorage(data: DatabaseSchema) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Storage quota exceeded or storage error:', e);
    }
  }

  private notify() {
    this.saveToStorage(this.data);
    this.listeners.forEach((l) => l());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public banks(): QuestionBank[] {
    return this.data.banks
      .filter((b) => b.enabled)
      .sort((a, b) => {
        if (a.builtIn && !b.builtIn) return -1;
        if (!a.builtIn && b.builtIn) return 1;
        return a.name.localeCompare(b.name, 'ar');
      });
  }

  public activeBankId(): string {
    return this.data.settings['active_bank_id'] || BUILTIN_BANK;
  }

  public setActiveBank(bankId: string) {
    const bank = this.data.banks.find((b) => b.id === bankId && b.enabled);
    if (!bank) throw new Error('Unknown or disabled bank');
    this.data.settings['active_bank_id'] = bankId;
    this.notify();
  }

  public activeBank(): QuestionBank {
    const activeId = this.activeBankId();
    const bank = this.data.banks.find((b) => b.id === activeId && b.enabled);
    if (bank) return bank;
    const fallback = this.data.banks.find((b) => b.enabled);
    if (!fallback) throw new Error('No enabled question bank');
    return fallback;
  }

  public questionCount(bankId: string = this.activeBankId()): number {
    return this.data.questions.filter((q) => q.bankId === bankId && q.enabled).length;
  }

  public qcmReadyCount(bankId: string = this.activeBankId()): number {
    return this.data.questions.filter(
      (q) =>
        q.bankId === bankId &&
        q.enabled &&
        q.questionType === 'QCM' &&
        q.qcmStatus === 'READY' &&
        q.wrong1 !== '' &&
        q.wrong2 !== '' &&
        q.wrong3 !== ''
    ).length;
  }

  public questions(bankId: string = this.activeBankId(), qcmOnly: boolean = false): QuizQuestion[] {
    return this.data.questions.filter((q) => {
      if (q.bankId !== bankId || !q.enabled) return false;
      if (qcmOnly) {
        return (
          q.questionType === 'QCM' &&
          q.qcmStatus === 'READY' &&
          Boolean(q.wrong1 && q.wrong2 && q.wrong3)
        );
      }
      return true;
    });
  }

  public questionPage(
    bankId: string = this.activeBankId(),
    search: string = '',
    topic: string | null = null,
    limit: number = 50,
    offset: number = 0
  ): QuizQuestion[] {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);
    const term = search.trim().toLowerCase();

    const filtered = this.data.questions.filter((q) => {
      if (q.bankId !== bankId || !q.enabled) return false;
      if (term) {
        const matchesQ = q.question.toLowerCase().includes(term);
        const matchesT = q.topic.toLowerCase().includes(term);
        if (!matchesQ && !matchesT) return false;
      }
      if (topic && q.topic !== topic) return false;
      return true;
    });

    return filtered.slice(safeOffset, safeOffset + safeLimit);
  }

  public searchCount(
    bankId: string = this.activeBankId(),
    search: string = '',
    topic: string | null = null
  ): number {
    const term = search.trim().toLowerCase();
    return this.data.questions.filter((q) => {
      if (q.bankId !== bankId || !q.enabled) return false;
      if (term) {
        const matchesQ = q.question.toLowerCase().includes(term);
        const matchesT = q.topic.toLowerCase().includes(term);
        if (!matchesQ && !matchesT) return false;
      }
      if (topic && q.topic !== topic) return false;
      return true;
    }).length;
  }

  public stats(bankId: string = this.activeBankId()): StudyStats {
    const questionIdsInBank = new Set(
      this.data.questions.filter((q) => q.bankId === bankId).map((q) => q.rowId)
    );

    let answered = 0;
    let correct = 0;
    let wrong = 0;

    for (const a of this.data.attempts) {
      if (questionIdsInBank.has(a.questionRowId)) {
        answered++;
        if (a.isCorrect) correct++;
        else wrong++;
      }
    }

    let favorites = 0;
    for (const rowId of questionIdsInBank) {
      if (this.data.questionStates[rowId]?.favorite) {
        favorites++;
      }
    }

    const successRate = answered === 0 ? 0 : Math.round((correct * 100) / answered);
    return { answered, correct, wrong, favorites, successRate };
  }

  public getActivityStats(
    period: 'daily' | 'weekly' | 'monthly',
    bankId: string = this.activeBankId()
  ): ActivityBucket[] {
    const questionIdsInBank = new Set(
      this.data.questions
        .filter((q) => q.bankId === bankId && q.enabled)
        .map((q) => q.rowId)
    );

    const bankAttempts = this.data.attempts.filter((a) =>
      questionIdsInBank.has(a.questionRowId)
    );

    const now = new Date();

    if (period === 'daily') {
      // Last 7 days
      const daysArabic = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      const buckets: ActivityBucket[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const start = d.getTime();
        const end = start + 24 * 60 * 60 * 1000;

        let total = 0;
        let correct = 0;
        let wrong = 0;

        for (const a of bankAttempts) {
          if (a.answeredAt >= start && a.answeredAt < end) {
            total++;
            if (a.isCorrect) correct++;
            else wrong++;
          }
        }

        const isToday = i === 0;
        const isYesterday = i === 1;
        const label = isToday ? 'اليوم' : isYesterday ? 'أمس' : daysArabic[d.getDay()];
        const subLabel = `${d.getDate()}/${d.getMonth() + 1}`;

        buckets.push({
          label,
          subLabel,
          total,
          correct,
          wrong,
          timestamp: start,
        });
      }
      return buckets;
    }

    if (period === 'weekly') {
      // Last 6 weeks (7-day blocks ending at today's end)
      const buckets: ActivityBucket[] = [];
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

      for (let i = 5; i >= 0; i--) {
        const weekEnd = endOfToday - i * 7 * 24 * 60 * 60 * 1000;
        const weekStart = weekEnd - 7 * 24 * 60 * 60 * 1000;

        let total = 0;
        let correct = 0;
        let wrong = 0;

        for (const a of bankAttempts) {
          if (a.answeredAt >= weekStart && a.answeredAt < weekEnd) {
            total++;
            if (a.isCorrect) correct++;
            else wrong++;
          }
        }

        const dStart = new Date(weekStart);
        const dEnd = new Date(weekEnd - 1000);
        const label = i === 0 ? 'هذا الأسبوع' : i === 1 ? 'الأسبوع الماضي' : `أسبوع -${i}`;
        const subLabel = `${dStart.getDate()}/${dStart.getMonth() + 1}`;

        buckets.push({
          label,
          subLabel,
          total,
          correct,
          wrong,
          timestamp: weekStart,
        });
      }
      return buckets;
    }

    // Monthly: Last 6 calendar months
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const buckets: ActivityBucket[] = [];

    for (let i = 5; i >= 0; i--) {
      const year = now.getFullYear();
      const month = now.getMonth() - i;
      const start = new Date(year, month, 1).getTime();
      const end = new Date(year, month + 1, 1).getTime();

      let total = 0;
      let correct = 0;
      let wrong = 0;

      for (const a of bankAttempts) {
        if (a.answeredAt >= start && a.answeredAt < end) {
          total++;
          if (a.isCorrect) correct++;
          else wrong++;
        }
      }

      const d = new Date(start);
      const label = arabicMonths[d.getMonth()];
      const subLabel = `${d.getFullYear()}`;

      buckets.push({
        label,
        subLabel,
        total,
        correct,
        wrong,
        timestamp: start,
      });
    }

    return buckets;
  }

  public mistakes(bankId: string = this.activeBankId()): QuizQuestion[] {
    const bankQuestions = this.data.questions.filter((q) => q.bankId === bankId && q.enabled);
    const mistakesList: Array<{ q: QuizQuestion; lastAnsweredAt: number }> = [];

    for (const q of bankQuestions) {
      const state = this.data.questionStates[q.rowId];
      if (state && state.wrongCount > 0) {
        mistakesList.push({ q, lastAnsweredAt: state.lastAnsweredAt || 0 });
      }
    }

    mistakesList.sort((a, b) => b.lastAnsweredAt - a.lastAnsweredAt);
    return mistakesList.map((m) => m.q);
  }

  public questionByRowId(rowId: number, bankId: string): QuizQuestion | null {
    const q = this.data.questions.find(
      (item) =>
        item.rowId === rowId &&
        item.bankId === bankId &&
        item.enabled &&
        item.questionType === 'QCM' &&
        item.qcmStatus === 'READY'
    );
    return q || null;
  }

  public randomQuestion(bankId: string = this.activeBankId()): QuizQuestion | null {
    const readyQuestions = this.questions(bankId, true);
    if (readyQuestions.length === 0) return null;
    const index = Math.floor(Math.random() * readyQuestions.length);
    return readyQuestions[index];
  }

  public isFavorite(questionRowId: number): boolean {
    return Boolean(this.data.questionStates[questionRowId]?.favorite);
  }

  public favorites(bankId: string = this.activeBankId()): QuizQuestion[] {
    const bankQuestions = this.data.questions.filter((q) => q.bankId === bankId && q.enabled);
    const favs: Array<{ q: QuizQuestion; lastAnsweredAt: number }> = [];

    for (const q of bankQuestions) {
      const state = this.data.questionStates[q.rowId];
      if (state && state.favorite) {
        favs.push({ q, lastAnsweredAt: state.lastAnsweredAt || 0 });
      }
    }

    favs.sort((a, b) => b.lastAnsweredAt - a.lastAnsweredAt);
    return favs.map((f) => f.q);
  }

  public clearMistake(questionRowId: number) {
    if (!this.data.questionStates[questionRowId]) {
      this.ensureQuestionState(questionRowId);
    }
    this.data.questionStates[questionRowId].wrongCount = 0;
    this.notify();
  }

  public setFavorite(questionRowId: number, value: boolean) {
    this.ensureQuestionState(questionRowId);
    this.data.questionStates[questionRowId].favorite = value;
    this.notify();
  }

  private ensureQuestionState(questionRowId: number) {
    if (!this.data.questionStates[questionRowId]) {
      this.data.questionStates[questionRowId] = {
        questionRowId,
        favorite: false,
        timesSeen: 0,
        correctCount: 0,
        wrongCount: 0,
        streak: 0,
        lastAnsweredAt: null,
        nextReviewAt: null,
      };
    }
  }

  public setting(key: string, defaultValue: string = ''): string {
    return this.data.settings[key] ?? defaultValue;
  }

  public setSetting(key: string, value: string) {
    this.data.settings[key] = value;
    this.notify();
  }

  public announcementSeen(id: string): boolean {
    return Boolean(id && this.setting('remote_announcement_seen_id', '') === id);
  }

  public markAnnouncementSeen(id: string) {
    if (id) {
      this.setSetting('remote_announcement_seen_id', id);
    }
  }

  public openSessionId(): number | null {
    const open = this.data.sessions
      .slice()
      .reverse()
      .find((s) => s.finishedAt === null && s.questionRowIds.length > 0);
    return open ? open.id : null;
  }

  public sessionAnsweredCount(sessionId: number): number {
    const s = this.data.sessions.find((session) => session.id === sessionId);
    return s ? s.answeredCount : 0;
  }

  public sessionAnsweredQuestionIds(sessionId: number): Set<number> {
    const set = new Set<number>();
    for (const a of this.data.attempts) {
      if (a.sessionId === sessionId) {
        set.add(a.questionRowId);
      }
    }
    return set;
  }

  public sessionStats(sessionId: number): StudyStats {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return { answered: 0, correct: 0, wrong: 0, favorites: 0, successRate: 0 };
    const a = session.answeredCount;
    const ok = session.correctCount;
    const rate = a === 0 ? 0 : Math.round((ok * 100) / a);
    return { answered: a, correct: ok, wrong: a - ok, favorites: 0, successRate: rate };
  }

  public topics(bankId: string = this.activeBankId()): string[] {
    const set = new Set<string>();
    const readyQuestions = this.questions(bankId, true);
    for (const q of readyQuestions) {
      if (q.topic.trim()) {
        set.add(q.topic.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }

  public topicCounts(bankId: string = this.activeBankId()): Record<string, number> {
    const counts: Record<string, number> = {};
    const readyQuestions = this.questions(bankId, true);
    for (const q of readyQuestions) {
      const t = q.topic.trim();
      if (t) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return counts;
  }

  public createSession(
    requestedCount: number,
    bankId: string = this.activeBankId(),
    mode: string = 'mixed'
  ): number {
    const safeCount = Math.min(Math.max(requestedCount, 1), 500);
    const newId = (this.data.sessions.length > 0
      ? Math.max(...this.data.sessions.map((s) => s.id))
      : 0) + 1;

    const session: StudySession = {
      id: newId,
      startedAt: Date.now(),
      finishedAt: null,
      requestedCount: safeCount,
      answeredCount: 0,
      correctCount: 0,
      mode,
      bankId,
      questionRowIds: [],
    };

    this.data.sessions.push(session);
    this.notify();
    return newId;
  }

  public sessionQuestions(
    count: number,
    topic: string | string[] | null = null,
    bankId: string = this.activeBankId()
  ): QuizQuestion[] {
    const safe = Math.min(Math.max(count, 1), 500);
    let pool = this.questions(bankId, true);
    if (Array.isArray(topic)) {
      const activeTopics = new Set(topic.map((t) => t.trim()).filter(Boolean));
      if (activeTopics.size > 0) {
        pool = pool.filter((q) => activeTopics.has(q.topic.trim()));
      }
    } else if (topic && topic.trim()) {
      pool = pool.filter((q) => q.topic === topic.trim());
    }
    // Shuffle pool
    const shuffled = pool.slice().sort(() => 0.5 - Math.random());
    return shuffled.slice(0, safe);
  }

  public attachSessionQuestions(sessionId: number, questions: QuizQuestion[]) {
    const session = this.data.sessions.find((s) => s.id === sessionId && s.finishedAt === null);
    if (!session) throw new Error('Unknown or finished session');
    session.questionRowIds = questions.map((q) => q.rowId);
    session.requestedCount = questions.length;
    this.notify();
  }

  public resumeSessionQuestions(sessionId: number): QuizQuestion[] {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return [];

    const answeredIds = this.sessionAnsweredQuestionIds(sessionId);
    // Filter questions: either active & ready, or already answered in this session
    const list: QuizQuestion[] = [];
    const updatedIds: number[] = [];

    for (const rowId of session.questionRowIds) {
      const q = this.data.questions.find((x) => x.rowId === rowId);
      const isAnswered = answeredIds.has(rowId);
      if (
        q &&
        (isAnswered ||
          (q.enabled &&
            q.questionType === 'QCM' &&
            q.qcmStatus === 'READY' &&
            q.wrong1 &&
            q.wrong2 &&
            q.wrong3))
      ) {
        list.push(q);
        updatedIds.push(rowId);
      }
    }

    session.questionRowIds = updatedIds;
    session.requestedCount = updatedIds.length;
    if (updatedIds.length === 0) {
      this.finishSession(sessionId);
    } else {
      this.notify();
    }
    return list;
  }

  public finishSession(sessionId: number) {
    const session = this.data.sessions.find((s) => s.id === sessionId && s.finishedAt === null);
    if (session) {
      session.finishedAt = Date.now();
      this.notify();
    }
  }

  public recordAnswer(
    questionRowId: number,
    selected: string,
    sessionId: number | null = null
  ): boolean {
    if (!selected.trim()) throw new Error('Selected answer cannot be blank');

    const question = this.data.questions.find(
      (q) =>
        q.rowId === questionRowId &&
        q.enabled &&
        q.questionType === 'QCM' &&
        q.qcmStatus === 'READY'
    );
    if (!question) throw new Error('Unknown, disabled, or non-ready question');

    const ok = selected.trim() === question.correctAnswer.trim();
    const now = Date.now();

    const attemptId = (this.data.attempts.length > 0
      ? Math.max(...this.data.attempts.map((a) => a.id))
      : 0) + 1;

    this.data.attempts.push({
      id: attemptId,
      questionRowId,
      selectedAnswer: selected,
      isCorrect: ok,
      answeredAt: now,
      sessionId,
    });

    this.ensureQuestionState(questionRowId);
    const state = this.data.questionStates[questionRowId];
    state.timesSeen += 1;
    if (ok) {
      state.correctCount += 1;
      state.streak += 1;
    } else {
      state.wrongCount += 1;
      state.streak = 0;
    }
    state.lastAnsweredAt = now;

    if (sessionId !== null) {
      const session = this.data.sessions.find(
        (s) => s.id === sessionId && s.finishedAt === null
      );
      if (session) {
        session.answeredCount += 1;
        if (ok) session.correctCount += 1;
      }
    }

    this.notify();
    return ok;
  }

  public importQuestionBank(name: string, description: string, preview: ExcelPreview): string {
    if (!preview.valid) throw new Error('Excel preview contains errors');
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      throw new Error('Bank name must be 2..80 characters');
    }

    const bankId = 'user_' + Math.random().toString(36).substring(2, 10);
    const now = Date.now();

    const newBank: QuestionBank = {
      id: bankId,
      name: cleanName,
      description: description.trim().slice(0, 300),
      version: 1,
      formatVersion: 1,
      builtIn: false,
      enabled: true,
      importedAt: now,
      sourceName: preview.sourceName.slice(0, 200),
    };

    let nextRowId = this.data.questions.length > 0
      ? Math.max(...this.data.questions.map((q) => q.rowId)) + 1
      : 1;

    const importedQuestions: QuizQuestion[] = preview.rows.map((row) => {
      const qRow: QuizQuestion = {
        rowId: nextRowId++,
        bankId,
        externalId: row.externalId,
        question: row.question,
        correctAnswer: row.answer,
        wrong1: row.wrong1,
        wrong2: row.wrong2,
        wrong3: row.wrong3,
        explanation: row.explanation,
        topic: row.topic,
        sourceDate: '',
        questionType: 'QCM',
        qcmStatus: 'READY',
        enabled: true,
      };
      this.ensureQuestionState(qRow.rowId);
      return qRow;
    });

    this.data.banks.push(newBank);
    this.data.questions.push(...importedQuestions);
    this.notify();
    return bankId;
  }

  public deleteUserBank(bankId: string) {
    if (bankId === BUILTIN_BANK) throw new Error('Built-in bank cannot be deleted');
    const bank = this.data.banks.find((b) => b.id === bankId && !b.builtIn);
    if (!bank) throw new Error('Unknown user bank');

    const now = Date.now();
    for (const session of this.data.sessions) {
      if (session.bankId === bankId && session.finishedAt === null) {
        session.finishedAt = now;
      }
    }

    bank.enabled = false;
    for (const q of this.data.questions) {
      if (q.bankId === bankId) {
        q.enabled = false;
      }
    }

    if (this.activeBankId() === bankId) {
      this.data.settings['active_bank_id'] = BUILTIN_BANK;
    }

    this.notify();
  }

  public saveRemote(s: RemoteState) {
    this.syncRemoteNotifications(s);
    this.setSetting('remote_latest', s.latest.toString());
    this.setSetting('remote_minimum', s.minimum.toString());
    this.setSetting('remote_update_url', s.updateUrl);
    this.setSetting('remote_update_title', s.updateTitle);
    this.setSetting('remote_update_message', s.updateMessage);
    this.setSetting('remote_announcement_id', s.announcementId);
    this.setSetting('remote_announcement_title', s.announcementTitle);
    this.setSetting('remote_announcement_message', s.announcementMessage);
    this.setSetting('remote_announcement_enabled', s.announcementEnabled ? '1' : '0');
    if (s.notifications) {
      this.setSetting('remote_notifications', JSON.stringify(s.notifications));
    }
    if (s.lastCheckedAt) {
      this.setSetting('remote_last_checked', s.lastCheckedAt.toString());
    }
    if (s.source) {
      this.setSetting('remote_source', s.source);
    }
  }

  public storedNotifications(): StoredNotification[] {
    return this.data.notifications
      .slice()
      .sort((a, b) => b.receivedAt - a.receivedAt);
  }

  private syncRemoteNotifications(s: RemoteState) {
    const incoming: AppNotification[] = [];

    if (s.latest > 1 || s.minimum > 1) {
      incoming.push({
        id: `sys_update_${s.latest}`,
        title: s.updateTitle || 'يتوفر تحديث جديد للتطبيق',
        message: s.updateMessage || 'يرجى تحديث التطبيق.',
        type: s.minimum > 1 ? 'alert' : 'update',
        url: s.updateUrl || undefined,
        date: 'تحديث فوري',
      });
    }

    if (s.announcementEnabled && s.announcementId && s.announcementMessage) {
      incoming.push({
        id: `sys_announcement_${s.announcementId}`,
        title: s.announcementTitle || 'إعلان من الإدارة',
        message: s.announcementMessage,
        type: 'info',
        date: 'تنويه هام',
      });
    }

    if (Array.isArray(s.notifications)) {
      incoming.push(...s.notifications);
    }

    const now = Date.now();
    const source = s.source || 'github';
    for (const item of incoming) {
      const id = String(item.id || '').trim();
      if (!id) continue;
      const existing = this.data.notifications.find((n) => n.id === id);
      if (existing) {
        existing.title = item.title;
        existing.message = item.message;
        existing.type = item.type;
        existing.date = item.date;
        existing.url = item.url;
        existing.source = source;
      } else {
        this.data.notifications.push({
          ...item,
          id,
          receivedAt: now,
          readAt: null,
          source,
        });
      }
    }
  }

  public isNotificationRead(id: string): boolean {
    const stored = this.data.notifications.find((n) => n.id === id);
    if (stored) return stored.readAt !== null;
    const readIds = this.getReadNotificationIds();
    return readIds.has(id);
  }

  public markNotificationAsRead(id: string) {
    const stored = this.data.notifications.find((n) => n.id === id);
    if (stored && stored.readAt === null) {
      stored.readAt = Date.now();
      this.notify();
      return;
    }
    const readIds = this.getReadNotificationIds();
    readIds.add(id);
    this.setSetting('read_notifications_ids', JSON.stringify(Array.from(readIds)));
  }

  public markAllNotificationsAsRead(ids: string[]) {
    const wanted = new Set(ids);
    const now = Date.now();
    let changed = false;
    for (const item of this.data.notifications) {
      if (wanted.has(item.id) && item.readAt === null) {
        item.readAt = now;
        changed = true;
      }
    }
    if (changed) this.notify();

    const missing = ids.filter((id) => !this.data.notifications.some((n) => n.id === id));
    if (missing.length > 0) {
      const readIds = this.getReadNotificationIds();
      missing.forEach((id) => readIds.add(id));
      this.setSetting('read_notifications_ids', JSON.stringify(Array.from(readIds)));
    }
  }

  private getReadNotificationIds(): Set<string> {
    try {
      const raw = this.setting('read_notifications_ids', '[]');
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  public cachedRemote(): RemoteState {
    const lastChecked = parseInt(this.setting('remote_last_checked', '0'), 10);
    const source = this.setting('remote_source', '') as 'github' | 'local' | '';
    let notifications: any[] = [];
    try {
      const rawNotifs = this.setting('remote_notifications', '[]');
      notifications = JSON.parse(rawNotifs);
    } catch {
      notifications = [];
    }

    return {
      latest: parseInt(this.setting('remote_latest', '1'), 10) || 1,
      minimum: parseInt(this.setting('remote_minimum', '1'), 10) || 1,
      updateUrl: this.setting('remote_update_url', ''),
      updateTitle: this.setting('remote_update_title', 'يتوفر تحديث جديد'),
      updateMessage: this.setting('remote_update_message', 'يرجى تحديث التطبيق.'),
      announcementId: this.setting('remote_announcement_id', ''),
      announcementTitle: this.setting('remote_announcement_title', ''),
      announcementMessage: this.setting('remote_announcement_message', ''),
      announcementEnabled: this.setting('remote_announcement_enabled', '0') === '1',
      notifications,
      lastCheckedAt: lastChecked || undefined,
      source: source || undefined,
    };
  }
}

export const db = new StudyDatabaseService();
