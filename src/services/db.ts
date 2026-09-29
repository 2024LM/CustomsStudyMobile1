import initialQuestionsRaw from '../data/questions.json';
import { loadNativeSnapshot, saveNativeSnapshot } from './nativeStorage';
import { appConfig } from '../config/appConfig';
import {
  ActivityBucket,
  AppNotification,
  Attempt,
  ExcelPreview,
  QuestionBank,
  QuestionState,
  QuizQuestion,
  RemoteState,
  StoredNotification,
  StudyDomain,
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
  domains: StudyDomain[];
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
  const defaultDomain: StudyDomain = {
    id: appConfig.defaultDomainId,
    name: appConfig.defaultDomainName,
    description: appConfig.defaultDomainDescription,
    enabled: true,
    builtIn: true,
    createdAt: now,
  };
  const builtInBank: QuestionBank = {
    domainId: defaultDomain.id,
    id: BUILTIN_BANK,
    name: 'بنك الأسئلة الأساسي',
    description: 'البنك الأساسي المرفق مع التطبيق',
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
    const qType: 'QCM' | 'TRUE_FALSE' | 'OPEN' | 'ORAL' = isOral ? 'ORAL' : hasDistractors ? 'QCM' : 'OPEN';
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
    active_domain_id: defaultDomain.id,
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
    domains: [defaultDomain],
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
  private nativePersistenceReady = false;

  constructor() {
    this.data = this.loadFromStorage();
  }

  public async initializePersistence(): Promise<void> {
    const nativeSnapshot = await loadNativeSnapshot();

    if (nativeSnapshot) {
      try {
        const parsed = JSON.parse(nativeSnapshot) as DatabaseSchema;
        if (parsed.banks && parsed.questions && parsed.settings) {
          parsed.domains = Array.isArray(parsed.domains) && parsed.domains.length > 0
            ? parsed.domains
            : [{
                id: appConfig.defaultDomainId,
                name: appConfig.defaultDomainName,
                description: appConfig.defaultDomainDescription,
                enabled: true,
                builtIn: true,
                createdAt: Date.now(),
              }];
          parsed.banks = parsed.banks.map((bank) => ({
            ...bank,
            domainId: bank.domainId || appConfig.defaultDomainId,
          }));
          parsed.settings.active_domain_id = parsed.settings.active_domain_id || appConfig.defaultDomainId;
          parsed.attempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
          parsed.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
          parsed.notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
          parsed.questionStates = parsed.questionStates && typeof parsed.questionStates === 'object'
            ? parsed.questionStates
            : {};

          this.data = parsed;
          this.nativePersistenceReady = true;

          // Keep a browser-readable recovery copy. SQLite remains authoritative on Android.
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
          } catch (error) {
            console.warn('Unable to refresh localStorage recovery copy:', error);
          }
          return;
        }
      } catch (error) {
        console.warn('Native SQLite snapshot was invalid; migrating local data instead.', error);
      }
    }

    // First Android launch after this upgrade: migrate the existing localStorage state.
    this.nativePersistenceReady = true;
    await saveNativeSnapshot(JSON.stringify(this.data));
  }

  private loadFromStorage(): DatabaseSchema {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DatabaseSchema;
        if (parsed.banks && parsed.questions && parsed.settings) {
          parsed.domains = Array.isArray(parsed.domains) && parsed.domains.length > 0
            ? parsed.domains
            : [{
                id: appConfig.defaultDomainId,
                name: appConfig.defaultDomainName,
                description: appConfig.defaultDomainDescription,
                enabled: true,
                builtIn: true,
                createdAt: Date.now(),
              }];
          parsed.banks = parsed.banks.map((bank) => ({
            ...bank,
            domainId: bank.domainId || appConfig.defaultDomainId,
          }));
          parsed.settings.active_domain_id = parsed.settings.active_domain_id || appConfig.defaultDomainId;
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
    const serialized = JSON.stringify(data);

    // Keep this recovery copy for the web build and for safe rollback during migration.
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (e) {
      console.warn('Storage quota exceeded or storage error:', e);
    }

    if (this.nativePersistenceReady) {
      void saveNativeSnapshot(serialized);
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

  public domains(): StudyDomain[] {
    return this.data.domains
      .filter((domain) => domain.enabled)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  public activeDomainId(): string {
    return this.data.settings['active_domain_id'] || appConfig.defaultDomainId;
  }

  public activeDomain(): StudyDomain {
    const activeId = this.activeDomainId();
    return this.data.domains.find((domain) => domain.id === activeId && domain.enabled)
      || this.domains()[0]
      || {
        id: appConfig.defaultDomainId,
        name: 'المجال الافتراضي',
        description: '',
        enabled: true,
        builtIn: true,
        createdAt: Date.now(),
      };
  }

  public setActiveDomain(domainId: string) {
    const domain = this.data.domains.find((item) => item.id === domainId && item.enabled);
    if (!domain) throw new Error('Unknown or disabled study domain');

    this.data.settings['active_domain_id'] = domainId;
    const activeBank = this.data.banks.find(
      (bank) => bank.id === this.activeBankId() && bank.enabled && bank.domainId === domainId
    );
    if (!activeBank) {
      const fallback = this.data.banks.find((bank) => bank.enabled && bank.domainId === domainId);
      if (fallback) this.data.settings['active_bank_id'] = fallback.id;
    }
    this.notify();
  }

  public createDomain(name: string, description: string = ''): string {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 80) {
      throw new Error('Domain name must be 2..80 characters');
    }

    const duplicate = this.data.domains.some(
      (domain) => domain.enabled && domain.name.trim().toLocaleLowerCase('ar') === cleanName.toLocaleLowerCase('ar')
    );
    if (duplicate) throw new Error('A study domain with this name already exists');

    const now = Date.now();
    const domainId = 'domain_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const bankId = 'bank_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 7);

    this.data.domains.push({
      id: domainId,
      name: cleanName,
      description: description.trim().slice(0, 300),
      enabled: true,
      builtIn: false,
      createdAt: now,
    });

    this.data.banks.push({
      domainId,
      id: bankId,
      name: 'البنك الرئيسي',
      description: 'بنك افتراضي للمجال الجديد',
      version: 1,
      formatVersion: 1,
      builtIn: false,
      enabled: true,
      importedAt: now,
      sourceName: 'generated',
    });

    this.data.settings['active_domain_id'] = domainId;
    this.data.settings['active_bank_id'] = bankId;
    this.notify();
    return domainId;
  }

  public deleteUserDomain(domainId: string) {
    const domain = this.data.domains.find((item) => item.id === domainId && item.enabled);
    if (!domain) throw new Error('Unknown or disabled study domain');
    if (domain.builtIn) throw new Error('Built-in study domain cannot be deleted');

    domain.enabled = false;
    const bankIds = new Set(
      this.data.banks
        .filter((bank) => bank.domainId === domainId)
        .map((bank) => bank.id)
    );

    for (const bank of this.data.banks) {
      if (bankIds.has(bank.id)) bank.enabled = false;
    }
    for (const question of this.data.questions) {
      if (bankIds.has(question.bankId)) question.enabled = false;
    }

    if (this.activeDomainId() === domainId) {
      const fallbackDomain = this.data.domains.find((item) => item.enabled);
      if (!fallbackDomain) throw new Error('No enabled study domain remains');
      this.data.settings['active_domain_id'] = fallbackDomain.id;

      const fallbackBank = this.data.banks.find(
        (bank) => bank.enabled && bank.domainId === fallbackDomain.id
      );
      if (fallbackBank) this.data.settings['active_bank_id'] = fallbackBank.id;
    }

    this.notify();
  }

  public domainQuestionCount(domainId: string): number {
    const bankIds = new Set(
      this.data.banks
        .filter((bank) => bank.enabled && bank.domainId === domainId)
        .map((bank) => bank.id)
    );
    return this.data.questions.filter(
      (question) => question.enabled && bankIds.has(question.bankId)
    ).length;
  }

  public domainBankCount(domainId: string): number {
    return this.data.banks.filter(
      (bank) => bank.enabled && bank.domainId === domainId
    ).length;
  }

  public banks(): QuestionBank[] {
    const domainId = this.activeDomainId();
    return this.data.banks
      .filter((b) => b.enabled && b.domainId === domainId)
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
    const domainId = this.activeDomainId();
    const bank = this.data.banks.find(
      (b) => b.id === bankId && b.enabled && b.domainId === domainId
    );
    if (!bank) throw new Error('Unknown, disabled, or cross-domain bank');
    this.data.settings['active_bank_id'] = bankId;
    this.notify();
  }

  public activeBank(): QuestionBank {
    const activeId = this.activeBankId();
    const domainId = this.activeDomainId();
    const bank = this.data.banks.find((b) => b.id === activeId && b.enabled && b.domainId === domainId);
    if (bank) return bank;
    const fallback = this.data.banks.find((b) => b.enabled && b.domainId === domainId);
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
        (q.questionType === 'QCM' || q.questionType === 'TRUE_FALSE') &&
        q.qcmStatus === 'READY' &&
        q.wrong1 !== '' &&
        q.wrong2 !== '' &&
        q.wrong3 !== ''
    ).length;
  }

  public playableQuestionCount(bankId: string = this.activeBankId()): number {
    return this.playableQuestions(bankId).length;
  }

  public playableQuestions(bankId: string = this.activeBankId()): QuizQuestion[] {
    return this.data.questions.filter((q) => {
      if (q.bankId !== bankId || !q.enabled || q.qcmStatus !== 'READY') return false;
      if (q.questionType === 'TRUE_FALSE') {
        const answer = q.correctAnswer.trim().toLowerCase();
        return ['صحيح', 'خطأ', 'true', 'false'].includes(answer);
      }
      return (
        q.questionType === 'QCM' &&
        Boolean(q.wrong1 && q.wrong2 && q.wrong3)
      );
    });
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
    offset: number = 0,
    questionType: 'QCM' | 'TRUE_FALSE' | 'OPEN' | 'ORAL' | null = null
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
      if (questionType && q.questionType !== questionType) return false;
      return true;
    });

    return filtered.slice(safeOffset, safeOffset + safeLimit);
  }

  public searchCount(
    bankId: string = this.activeBankId(),
    search: string = '',
    topic: string | null = null,
    questionType: 'QCM' | 'TRUE_FALSE' | 'OPEN' | 'ORAL' | null = null
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
      if (questionType && q.questionType !== questionType) return false;
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

  public dashboardAnalytics(bankId: string | null = null): {
    stats: StudyStats;
    totalQuestions: number;
    playableQuestions: number;
    dueReview: number;
    unseen: number;
    currentWeek: { total: number; correct: number; rate: number };
    previousWeek: { total: number; correct: number; rate: number };
    weeklyDelta: number;
    weakTopics: Array<{ topic: string; attempts: number; correct: number; wrong: number; successRate: number }>;
    strongTopics: Array<{ topic: string; attempts: number; correct: number; wrong: number; successRate: number }>;
    topMistakes: Array<{ question: QuizQuestion; wrongCount: number; correctCount: number }>;
    heatmap: Array<{ date: string; total: number; correct: number }>;
  } {
    const targetBankIds = new Set(
      this.data.banks
        .filter((bank) => bank.enabled && bank.domainId === this.activeDomainId() && (!bankId || bank.id === bankId))
        .map((bank) => bank.id)
    );
    const questions = this.data.questions.filter((q) => q.enabled && targetBankIds.has(q.bankId));
    const questionIds = new Set(questions.map((q) => q.rowId));
    const attempts = this.data.attempts.filter((a) => questionIds.has(a.questionRowId));

    const totalQuestions = questions.length;
    const playableQuestions = questions.filter((q) => {
      if (q.qcmStatus !== 'READY') return false;
      if (q.questionType === 'TRUE_FALSE') {
        return ['صحيح', 'خطأ', 'true', 'false'].includes(q.correctAnswer.trim().toLowerCase());
      }
      return q.questionType === 'QCM' && Boolean(q.wrong1 && q.wrong2 && q.wrong3);
    }).length;

    let correct = 0;
    for (const a of attempts) if (a.isCorrect) correct += 1;
    const wrong = attempts.length - correct;
    let favorites = 0;
    let dueReview = 0;
    let unseen = 0;
    const now = Date.now();

    for (const q of questions) {
      const state = this.data.questionStates[q.rowId];
      if (state?.favorite) favorites += 1;
      if (!state || state.timesSeen === 0) unseen += 1;
      if (state?.nextReviewAt && state.nextReviewAt <= now) dueReview += 1;
    }

    const stats: StudyStats = {
      answered: attempts.length,
      correct,
      wrong,
      favorites,
      successRate: attempts.length ? Math.round((correct * 100) / attempts.length) : 0,
    };

    const dayMs = 24 * 60 * 60 * 1000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const currentStart = todayStart.getTime() - 6 * dayMs;
    const previousStart = currentStart - 7 * dayMs;

    const summarize = (start: number, end: number) => {
      const list = attempts.filter((a) => a.answeredAt >= start && a.answeredAt < end);
      const c = list.filter((a) => a.isCorrect).length;
      return { total: list.length, correct: c, rate: list.length ? Math.round((c * 100) / list.length) : 0 };
    };
    const currentWeek = summarize(currentStart, now + 1);
    const previousWeek = summarize(previousStart, currentStart);
    const weeklyDelta = currentWeek.rate - previousWeek.rate;

    const topicMap = new Map<string, { attempts: number; correct: number; wrong: number }>();
    const questionMap = new Map(questions.map((q) => [q.rowId, q] as const));
    for (const a of attempts) {
      const q = questionMap.get(a.questionRowId);
      if (!q) continue;
      const topic = q.topic.trim() || 'عام';
      const item = topicMap.get(topic) || { attempts: 0, correct: 0, wrong: 0 };
      item.attempts += 1;
      if (a.isCorrect) item.correct += 1;
      else item.wrong += 1;
      topicMap.set(topic, item);
    }
    const topicStats = Array.from(topicMap.entries()).map(([topic, value]) => ({
      topic,
      ...value,
      successRate: value.attempts ? Math.round((value.correct * 100) / value.attempts) : 0,
    }));
    const weakTopics = topicStats.slice().sort((a, b) => a.successRate - b.successRate || b.attempts - a.attempts).slice(0, 5);
    const strongTopics = topicStats.slice().sort((a, b) => b.successRate - a.successRate || b.attempts - a.attempts).slice(0, 5);

    const topMistakes = questions
      .map((question) => {
        const state = this.data.questionStates[question.rowId];
        return { question, wrongCount: state?.wrongCount || 0, correctCount: state?.correctCount || 0 };
      })
      .filter((item) => item.wrongCount > 0)
      .sort((a, b) => b.wrongCount - a.wrongCount || a.correctCount - b.correctCount)
      .slice(0, 5);

    const heatmap: Array<{ date: string; total: number; correct: number }> = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + dayMs;
      const list = attempts.filter((a) => a.answeredAt >= start && a.answeredAt < end);
      heatmap.push({
        date: [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'),
        total: list.length,
        correct: list.filter((a) => a.isCorrect).length,
      });
    }

    return {
      stats,
      totalQuestions,
      playableQuestions,
      dueReview,
      unseen,
      currentWeek,
      previousWeek,
      weeklyDelta,
      weakTopics,
      strongTopics,
      topMistakes,
      heatmap,
    };
  }

  public getActivityStats(
    period: 'daily' | 'weekly' | 'monthly',
    bankId: string | null = null
  ): ActivityBucket[] {
    const enabledBankIds = new Set(this.data.banks.filter((b) => b.enabled).map((b) => b.id));
    const questionIdsInBank = new Set(
      this.data.questions
        .filter((q) => q.enabled && enabledBankIds.has(q.bankId) && (!bankId || q.bankId === bankId))
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
        (item.questionType === 'QCM' || item.questionType === 'TRUE_FALSE') &&
        item.qcmStatus === 'READY'
    );
    return q || null;
  }

  public randomQuestion(bankId: string = this.activeBankId()): QuizQuestion | null {
    const readyQuestions = this.playableQuestions(bankId);
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

  public searchAcrossActiveDomain(term: string): Array<{ question: QuizQuestion; bankName: string }> {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    const bankMap = new Map(
      this.data.banks
        .filter((bank) => bank.enabled && bank.domainId === this.activeDomainId())
        .map((bank) => [bank.id, bank.name] as const)
    );

    return this.data.questions
      .filter((question) => {
        if (!question.enabled || !bankMap.has(question.bankId)) return false;
        return question.question.toLowerCase().includes(q)
          || question.topic.toLowerCase().includes(q)
          || question.explanation.toLowerCase().includes(q)
          || question.correctAnswer.toLowerCase().includes(q);
      })
      .slice(0, 100)
      .map((question) => ({ question, bankName: bankMap.get(question.bankId) || '' }));
  }

  public questionNote(questionRowId: number): string {
    try {
      const raw = this.setting('question_notes_v1', '{}');
      const notes = JSON.parse(raw) as Record<string, string>;
      return notes[String(questionRowId)] || '';
    } catch {
      return '';
    }
  }

  public setQuestionNote(questionRowId: number, note: string) {
    let notes: Record<string, string> = {};
    try {
      notes = JSON.parse(this.setting('question_notes_v1', '{}')) || {};
    } catch {}
    const clean = note.trim().slice(0, 4000);
    if (clean) notes[String(questionRowId)] = clean;
    else delete notes[String(questionRowId)];
    this.data.settings['question_notes_v1'] = JSON.stringify(notes);
    this.notify();
  }

  public notedQuestions(): Array<{ question: QuizQuestion; note: string }> {
    let notes: Record<string, string> = {};
    try {
      notes = JSON.parse(this.setting('question_notes_v1', '{}')) || {};
    } catch {}
    return Object.entries(notes)
      .map(([rowId, note]) => ({
        question: this.data.questions.find((q) => q.rowId === Number(rowId) && q.enabled),
        note,
      }))
      .filter((item): item is { question: QuizQuestion; note: string } => Boolean(item.question && item.note.trim()))
      .sort((a, b) => a.question.question.localeCompare(b.question.question, 'ar'));
  }

  public addManualQuestion(input: {
    bankId?: string;
    question: string;
    correctAnswer: string;
    wrong1: string;
    wrong2: string;
    wrong3: string;
    explanation?: string;
    topic?: string;
  }): number {
    const bankId = input.bankId || this.activeBankId();
    const bank = this.data.banks.find(
      (item) => item.id === bankId && item.enabled && item.domainId === this.activeDomainId()
    );
    if (!bank) throw new Error('Unknown or inactive bank');

    const question = input.question.trim();
    const answer = input.correctAnswer.trim();
    const wrongs = [input.wrong1, input.wrong2, input.wrong3].map((v) => v.trim());
    if (question.length < 3 || !answer || wrongs.some((v) => !v)) {
      throw new Error('Question and all four answer options are required');
    }
    const normalized = new Set([answer, ...wrongs].map((v) => v.toLocaleLowerCase('ar')));
    if (normalized.size !== 4) throw new Error('Answer options must be different');

    const rowId = this.data.questions.length
      ? Math.max(...this.data.questions.map((q) => q.rowId)) + 1
      : 1;
    const externalId = 'manual_' + Date.now().toString(36);

    this.data.questions.push({
      rowId,
      bankId,
      externalId,
      question: question.slice(0, 2000),
      correctAnswer: answer.slice(0, 2000),
      wrong1: wrongs[0].slice(0, 2000),
      wrong2: wrongs[1].slice(0, 2000),
      wrong3: wrongs[2].slice(0, 2000),
      explanation: (input.explanation || '').trim().slice(0, 2000),
      topic: (input.topic || '').trim().slice(0, 200),
      sourceDate: '',
      questionType: 'QCM',
      qcmStatus: 'READY',
      enabled: true,
    });
    this.ensureQuestionState(rowId);
    this.notify();
    return rowId;
  }

  public sessionHistory(limit: number = 100): Array<{
    id: number;
    startedAt: number;
    finishedAt: number | null;
    durationMinutes: number;
    answered: number;
    correct: number;
    wrong: number;
    successRate: number;
    mode: string;
    bankId: string;
    bankName: string;
  }> {
    const bankNames = new Map(this.data.banks.map((bank) => [bank.id, bank.name] as const));
    return this.data.sessions
      .slice()
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, Math.min(Math.max(limit, 1), 500))
      .map((session) => {
        const finishedAt = session.finishedAt;
        const end = finishedAt || Date.now();
        const durationMinutes = Math.max(0, Math.round((end - session.startedAt) / 60000));
        const answered = session.answeredCount;
        const correct = session.correctCount;
        return {
          id: session.id,
          startedAt: session.startedAt,
          finishedAt,
          durationMinutes,
          answered,
          correct,
          wrong: Math.max(0, answered - correct),
          successRate: answered ? Math.round((correct * 100) / answered) : 0,
          mode: session.mode,
          bankId: session.bankId,
          bankName: bankNames.get(session.bankId) || 'بنك محذوف',
        };
      });
  }

  public weakTopics(bankId: string = this.activeBankId()): Array<{
    topic: string;
    attempts: number;
    correct: number;
    wrong: number;
    successRate: number;
  }> {
    const questions = this.data.questions.filter((q) => q.enabled && q.bankId === bankId);
    const byId = new Map(questions.map((q) => [q.rowId, q] as const));
    const stats = new Map<string, { attempts: number; correct: number; wrong: number }>();

    for (const attempt of this.data.attempts) {
      const question = byId.get(attempt.questionRowId);
      if (!question) continue;
      const topic = question.topic.trim() || 'عام';
      const current = stats.get(topic) || { attempts: 0, correct: 0, wrong: 0 };
      current.attempts += 1;
      if (attempt.isCorrect) current.correct += 1;
      else current.wrong += 1;
      stats.set(topic, current);
    }

    return Array.from(stats.entries())
      .map(([topic, value]) => ({
        topic,
        ...value,
        successRate: value.attempts ? Math.round((value.correct * 100) / value.attempts) : 0,
      }))
      .sort((a, b) => a.successRate - b.successRate || b.attempts - a.attempts);
  }

  public smartSessionPlan(count: number = 20, bankId: string = this.activeBankId()): {
    questions: QuizQuestion[];
    mistakes: number;
    due: number;
    unseen: number;
    other: number;
  } {
    const questions = this.smartQuestionPool(count, bankId);
    const now = Date.now();
    let mistakes = 0;
    let due = 0;
    let unseen = 0;
    let other = 0;

    for (const question of questions) {
      const state = this.data.questionStates[question.rowId];
      if ((state?.wrongCount || 0) > 0) mistakes += 1;
      else if (state?.nextReviewAt && state.nextReviewAt <= now) due += 1;
      else if (!state || state.timesSeen === 0) unseen += 1;
      else other += 1;
    }

    return { questions, mistakes, due, unseen, other };
  }

  public smartQuestionPool(count: number = 20, bankId: string = this.activeBankId()): QuizQuestion[] {
    const safe = Math.min(Math.max(count, 1), 200);
    const now = Date.now();
    const scored = this.playableQuestions(bankId).map((question) => {
      const state = this.data.questionStates[question.rowId];
      let score = 0;
      if (!state || state.timesSeen === 0) score += 35;
      if (state) {
        score += Math.min(state.wrongCount * 12, 60);
        score -= Math.min(state.correctCount * 2, 20);
        if (state.nextReviewAt && state.nextReviewAt <= now) score += 30;
        if (state.lastAnsweredAt) {
          const days = Math.floor((now - state.lastAnsweredAt) / (24 * 60 * 60 * 1000));
          score += Math.min(days, 30);
        }
      }
      return { question, score: score + Math.random() * 5 };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, safe)
      .map((item) => item.question);
  }

  public questionTags(questionRowId: number): string[] {
    try {
      const all = JSON.parse(this.setting('question_tags_v1', '{}')) as Record<string, string[]>;
      return Array.isArray(all[String(questionRowId)]) ? all[String(questionRowId)] : [];
    } catch {
      return [];
    }
  }

  public setQuestionTags(questionRowId: number, tags: string[]) {
    let all: Record<string, string[]> = {};
    try { all = JSON.parse(this.setting('question_tags_v1', '{}')) || {}; } catch {}
    const clean = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 20);
    if (clean.length) all[String(questionRowId)] = clean;
    else delete all[String(questionRowId)];
    this.data.settings['question_tags_v1'] = JSON.stringify(all);
    this.notify();
  }

  public questionDifficulty(questionRowId: number): 'easy' | 'medium' | 'hard' | '' {
    try {
      const all = JSON.parse(this.setting('question_difficulty_v1', '{}')) as Record<string, string>;
      const value = all[String(questionRowId)];
      return value === 'easy' || value === 'medium' || value === 'hard' ? value : '';
    } catch {
      return '';
    }
  }

  public setQuestionDifficulty(questionRowId: number, difficulty: 'easy' | 'medium' | 'hard' | '') {
    let all: Record<string, string> = {};
    try { all = JSON.parse(this.setting('question_difficulty_v1', '{}')) || {}; } catch {}
    if (difficulty) all[String(questionRowId)] = difficulty;
    else delete all[String(questionRowId)];
    this.data.settings['question_difficulty_v1'] = JSON.stringify(all);
    this.notify();
  }

  public updateQuestion(rowId: number, patch: Partial<Pick<QuizQuestion,
    'question' | 'correctAnswer' | 'wrong1' | 'wrong2' | 'wrong3' | 'explanation' | 'topic'
  >>) {
    const question = this.data.questions.find((q) => q.rowId === rowId && q.enabled);
    if (!question) throw new Error('Unknown question');

    const next = { ...question, ...patch };
    const required = [next.question, next.correctAnswer];
    if (required.some((value) => !value.trim())) throw new Error('Question and answer are required');

    if (next.questionType === 'QCM') {
      const options = [next.correctAnswer, next.wrong1, next.wrong2, next.wrong3].map((value) => value.trim());
      if (options.some((value) => !value)) throw new Error('QCM needs four answer options');
      if (new Set(options.map((value) => value.toLocaleLowerCase('ar'))).size !== 4) {
        throw new Error('Answer options must be different');
      }
    }

    question.question = next.question.trim().slice(0, 2000);
    question.correctAnswer = next.correctAnswer.trim().slice(0, 2000);
    question.wrong1 = next.wrong1.trim().slice(0, 2000);
    question.wrong2 = next.wrong2.trim().slice(0, 2000);
    question.wrong3 = next.wrong3.trim().slice(0, 2000);
    question.explanation = next.explanation.trim().slice(0, 2000);
    question.topic = next.topic.trim().slice(0, 200);
    this.notify();
  }

  public deleteQuestion(rowId: number) {
    const question = this.data.questions.find((q) => q.rowId === rowId && q.enabled);
    if (!question) throw new Error('Unknown question');
    question.enabled = false;
    this.notify();
  }

  public duplicateQuestion(rowId: number, targetBankId: string = this.activeBankId()): number {
    const source = this.data.questions.find((q) => q.rowId === rowId && q.enabled);
    const target = this.data.banks.find(
      (bank) => bank.id === targetBankId && bank.enabled && bank.domainId === this.activeDomainId()
    );
    if (!source || !target) throw new Error('Unknown question or target bank');

    const newRowId = this.data.questions.length
      ? Math.max(...this.data.questions.map((q) => q.rowId)) + 1
      : 1;

    this.data.questions.push({
      ...source,
      rowId: newRowId,
      bankId: targetBankId,
      externalId: 'copy_' + Date.now().toString(36) + '_' + newRowId,
    });
    this.ensureQuestionState(newRowId);
    this.notify();
    return newRowId;
  }

  public mergeBanks(sourceBankIds: string[], name: string): string {
    const ids = Array.from(new Set(sourceBankIds));
    const domainId = this.activeDomainId();
    const sources = this.data.banks.filter((bank) => ids.includes(bank.id) && bank.enabled && bank.domainId === domainId);
    if (sources.length < 2) throw new Error('Select at least two banks');

    const cleanName = name.trim().slice(0, 80);
    if (cleanName.length < 2) throw new Error('Bank name is too short');

    const newBankId = 'merged_' + Date.now().toString(36);
    const now = Date.now();
    this.data.banks.push({
      domainId,
      id: newBankId,
      name: cleanName,
      description: 'بنك مدمج داخل التطبيق',
      version: 1,
      formatVersion: 1,
      builtIn: false,
      enabled: true,
      importedAt: now,
      sourceName: 'merged',
    });

    const signatures = new Set<string>();
    let nextRowId = this.data.questions.length
      ? Math.max(...this.data.questions.map((q) => q.rowId)) + 1
      : 1;

    for (const question of this.data.questions.filter((q) => q.enabled && ids.includes(q.bankId))) {
      const signature = (question.question.trim() + '|' + question.correctAnswer.trim()).toLocaleLowerCase('ar');
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      const rowId = nextRowId++;
      this.data.questions.push({
        ...question,
        rowId,
        bankId: newBankId,
        externalId: 'merge_' + rowId,
      });
      this.ensureQuestionState(rowId);
    }

    this.notify();
    return newBankId;
  }

  public compareBanks(bankAId: string, bankBId: string): {
    bankAName: string;
    bankBName: string;
    bankACount: number;
    bankBCount: number;
    shared: number;
    onlyA: number;
    onlyB: number;
  } {
    const bankA = this.data.banks.find((bank) => bank.id === bankAId && bank.enabled);
    const bankB = this.data.banks.find((bank) => bank.id === bankBId && bank.enabled);
    if (!bankA || !bankB) throw new Error('Unknown bank');

    const sig = (q: QuizQuestion) =>
      (q.question.trim() + '|' + q.correctAnswer.trim()).toLocaleLowerCase('ar');

    const setA = new Set(
      this.data.questions.filter((q) => q.enabled && q.bankId === bankAId).map(sig)
    );
    const setB = new Set(
      this.data.questions.filter((q) => q.enabled && q.bankId === bankBId).map(sig)
    );

    let shared = 0;
    for (const item of setA) if (setB.has(item)) shared += 1;

    return {
      bankAName: bankA.name,
      bankBName: bankB.name,
      bankACount: setA.size,
      bankBCount: setB.size,
      shared,
      onlyA: setA.size - shared,
      onlyB: setB.size - shared,
    };
  }

  public bankValidation(bankId: string = this.activeBankId()): {
    total: number;
    duplicates: number;
    incomplete: number;
    duplicateIds: number;
  } {
    const questions = this.data.questions.filter((q) => q.enabled && q.bankId === bankId);
    const signatures = new Set<string>();
    const ids = new Set<string>();
    let duplicates = 0;
    let duplicateIds = 0;
    let incomplete = 0;

    for (const question of questions) {
      const signature = (question.question.trim() + '|' + question.correctAnswer.trim()).toLocaleLowerCase('ar');
      if (signatures.has(signature)) duplicates += 1;
      else signatures.add(signature);

      if (ids.has(question.externalId)) duplicateIds += 1;
      else ids.add(question.externalId);

      if (!question.question.trim() || !question.correctAnswer.trim()) incomplete += 1;
      if (question.questionType === 'QCM' && (!question.wrong1 || !question.wrong2 || !question.wrong3)) incomplete += 1;
    }

    return { total: questions.length, duplicates, incomplete, duplicateIds };
  }

  public studyPlanAnalytics(bankId: string | null = null): {
    playable: number;
    unseenPlayable: number;
    reviewedPlayable: number;
    todayAnswered: number;
    todayCorrect: number;
  } {
    const domainId = this.activeDomainId();
    const targetBankIds = new Set(
      this.data.banks
        .filter((bank) => bank.enabled && bank.domainId === domainId && (!bankId || bank.id === bankId))
        .map((bank) => bank.id)
    );

    const playable = this.data.questions.filter((q) => {
      if (!q.enabled || !targetBankIds.has(q.bankId) || q.qcmStatus !== 'READY') return false;
      if (q.questionType === 'TRUE_FALSE') {
        return ['صحيح', 'خطأ', 'true', 'false'].includes(q.correctAnswer.trim().toLowerCase());
      }
      return q.questionType === 'QCM' && Boolean(q.wrong1 && q.wrong2 && q.wrong3);
    });
    const playableIds = new Set(playable.map((q) => q.rowId));

    let unseenPlayable = 0;
    for (const q of playable) {
      if (!this.data.questionStates[q.rowId] || this.data.questionStates[q.rowId].timesSeen === 0) {
        unseenPlayable += 1;
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    let todayAnswered = 0;
    let todayCorrect = 0;
    for (const attempt of this.data.attempts) {
      if (attempt.answeredAt < todayStart.getTime() || !playableIds.has(attempt.questionRowId)) continue;
      todayAnswered += 1;
      if (attempt.isCorrect) todayCorrect += 1;
    }

    return {
      playable: playable.length,
      unseenPlayable,
      reviewedPlayable: playable.length - unseenPlayable,
      todayAnswered,
      todayCorrect,
    };
  }

  public activityCalendar(days: number = 90): Array<{ date: string; total: number; correct: number }> {
    const safeDays = Math.min(Math.max(days, 7), 365);
    const map = new Map<string, { total: number; correct: number }>();
    for (const attempt of this.data.attempts) {
      const date = new Date(attempt.answeredAt);
      const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      const current = map.get(key) || { total: 0, correct: 0 };
      current.total += 1;
      if (attempt.isCorrect) current.correct += 1;
      map.set(key, current);
    }

    const result: Array<{ date: string; total: number; correct: number }> = [];
    for (let i = safeDays - 1; i >= 0; i--) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      const value = map.get(key) || { total: 0, correct: 0 };
      result.push({ date: key, ...value });
    }
    return result;
  }

  public studyStreak(): number {
    const activeDays = new Set(
      this.data.attempts.map((attempt) => {
        const date = new Date(attempt.answeredAt);
        return [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
      })
    );
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    for (;;) {
      const key = [cursor.getFullYear(), cursor.getMonth(), cursor.getDate()].join('-');
      if (!activeDays.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  public exportBackup(): string {
    return JSON.stringify({
      schema: 'study_backup_v1',
      exportedAt: Date.now(),
      data: this.data,
    });
  }

  public importBackup(raw: string) {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== 'study_backup_v1' || !parsed.data) {
      throw new Error('Invalid backup file');
    }
    const data = parsed.data as DatabaseSchema;
    if (!Array.isArray(data.banks) || !Array.isArray(data.questions) || !data.settings) {
      throw new Error('Backup data is incomplete');
    }
    data.domains = Array.isArray(data.domains) && data.domains.length ? data.domains : this.data.domains;
    data.attempts = Array.isArray(data.attempts) ? data.attempts : [];
    data.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    data.notifications = Array.isArray(data.notifications) ? data.notifications : [];
    data.questionStates = data.questionStates && typeof data.questionStates === 'object' ? data.questionStates : {};
    this.data = data;
    this.notify();
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
    const readyQuestions = this.playableQuestions(bankId);
    for (const q of readyQuestions) {
      if (q.topic.trim()) {
        set.add(q.topic.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }

  public topicCounts(bankId: string = this.activeBankId()): Record<string, number> {
    const counts: Record<string, number> = {};
    const readyQuestions = this.playableQuestions(bankId);
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

  public dueReviewQuestions(
    count: number,
    topic: string | string[] | null = null,
    bankId: string = this.activeBankId()
  ): QuizQuestion[] {
    const safe = Math.min(Math.max(count, 1), 500);
    const now = Date.now();
    let pool = this.playableQuestions(bankId).filter((question) => {
      const state = this.data.questionStates[question.rowId];
      return Boolean(state?.nextReviewAt && state.nextReviewAt <= now);
    });

    if (Array.isArray(topic)) {
      const activeTopics = new Set(topic.map((item) => item.trim()).filter(Boolean));
      if (activeTopics.size > 0) {
        pool = pool.filter((question) => activeTopics.has(question.topic.trim()));
      }
    } else if (topic && topic.trim()) {
      pool = pool.filter((question) => question.topic === topic.trim());
    }

    return pool
      .sort((a, b) => {
        const aDue = this.data.questionStates[a.rowId]?.nextReviewAt || 0;
        const bDue = this.data.questionStates[b.rowId]?.nextReviewAt || 0;
        return aDue - bDue;
      })
      .slice(0, safe);
  }

  public sessionQuestions(
    count: number,
    topic: string | string[] | null = null,
    bankId: string = this.activeBankId()
  ): QuizQuestion[] {
    const safe = Math.min(Math.max(count, 1), 500);
    let pool = this.playableQuestions(bankId);
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

      const intervalsDays = [1, 3, 7, 14, 30, 60];
      const intervalIndex = Math.min(Math.max(state.streak - 1, 0), intervalsDays.length - 1);
      state.nextReviewAt = now + intervalsDays[intervalIndex] * 24 * 60 * 60 * 1000;
    } else {
      state.wrongCount += 1;
      state.streak = 0;
      // Wrong answers return quickly while the memory is still fresh.
      state.nextReviewAt = now + 10 * 60 * 1000;
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
      domainId: this.activeDomainId(),
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
        wrong1: row.questionType === 'TRUE_FALSE'
          ? (row.answer.trim().toLowerCase() === 'صحيح' || row.answer.trim().toLowerCase() === 'true' ? 'خطأ' : 'صحيح')
          : row.wrong1,
        wrong2: row.questionType === 'TRUE_FALSE' ? '' : row.wrong2,
        wrong3: row.questionType === 'TRUE_FALSE' ? '' : row.wrong3,
        explanation: row.explanation,
        topic: row.topic,
        sourceDate: '',
        questionType: row.questionType || 'QCM',
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
    if (s.ratingPrompt) {
      this.setSetting('remote_rating_prompt', JSON.stringify(s.ratingPrompt));
    }
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

    let ratingPrompt;
    try {
      ratingPrompt = JSON.parse(this.setting('remote_rating_prompt', 'null'));
    } catch {
      ratingPrompt = undefined;
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
      ratingPrompt: ratingPrompt || undefined,
      lastCheckedAt: lastChecked || undefined,
      source: source || undefined,
    };
  }
}

export const db = new StudyDatabaseService();
