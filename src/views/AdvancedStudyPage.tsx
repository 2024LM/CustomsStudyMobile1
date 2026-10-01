import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Brain,
  Layers3,
  ChartNoAxesCombined,
  CheckCircle2,
  XCircle,
  Target,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Clock3,
  Database,
  Download,
  FileDown,
  FileUp,
  Headphones,
  LibraryBig,
  ListChecks,
  NotebookPen,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  Volume2,
} from 'lucide-react';
import { PurpleSubpageHeader } from '../components/PurpleSubpageHeader';
import { db } from '../services/db';
import {
  addFlashcard,
  addGlossaryItem,
  deleteFlashcard,
  deleteGeneralNote,
  deleteGlossaryItem,
  dueFlashcards,
  flashcards,
  focusMinutesToday,
  generalNotes,
  glossaryItems,
  gradeFlashcard,
  recordFocusMinutes,
  saveGeneralNote,
} from '../services/advancedStudyTools';
import { QuizQuestion } from '../types';
import { arabicTtsStatus } from '../services/arabicTts';
import { SpeakButton } from '../components/SpeakButton';
import { ActivityBarChart } from '../components/ActivityBarChart';

type Section =
  | 'tools'
  | 'smart'
  | 'flashcards'
  | 'history'
  | 'pomodoro'
  | 'knowledge'
  | 'banks'
  | 'analytics'
  | 'backup';

type StudyGroup = 'study' | 'knowledge' | 'performance' | 'banks' | 'backup';

function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const AdvancedStudyPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [section, setSection] = useState<Section>('smart');
  const [status, setStatus] = useState('');
  const [, setRefresh] = useState(0);
  const [toolQuery, setToolQuery] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [manual, setManual] = useState({
    bankId: db.activeBankId(),
    question: '',
    correctAnswer: '',
    wrong1: '',
    wrong2: '',
    wrong3: '',
    explanation: '',
    topic: '',
  });
  const [ttsInfo, setTtsInfo] = useState<{ ready: boolean; arabic: boolean; locale: string; voice: string } | null>(null);

  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const [pomodoroMode, setPomodoroMode] = useState<'25' | '50' | 'custom'>('25');
  const [customMinutes, setCustomMinutes] = useState(30);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const completedFocusRef = useRef(false);

  const [editorQuestion, setEditorQuestion] = useState<QuizQuestion | null>(null);
  const [editorDraft, setEditorDraft] = useState<QuizQuestion | null>(null);
  const [bankSearch, setBankSearch] = useState('');
  const [selectedMergeBanks, setSelectedMergeBanks] = useState<string[]>([]);
  const [mergedName, setMergedName] = useState('بنك مدمج');
  const [compareA, setCompareA] = useState(() => db.banks()[0]?.id || '');
  const [compareB, setCompareB] = useState(() => db.banks()[1]?.id || db.banks()[0]?.id || '');
  const [analyticsBankId, setAnalyticsBankId] = useState<string>('ALL');
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const backupInputRef = useRef<HTMLInputElement>(null);

  const groupForSection = (value: Section): StudyGroup => {
    if (value === 'tools' || value === 'smart' || value === 'pomodoro') return 'study';
    if (value === 'flashcards' || value === 'knowledge') return 'knowledge';
    if (value === 'history' || value === 'analytics') return 'performance';
    if (value === 'banks') return 'banks';
    return 'backup';
  };

  const activeGroup = groupForSection(section);
  const groups: Array<{ id: StudyGroup; label: string; icon: any; defaultSection: Section }> = [
    { id: 'study', label: 'الدراسة', icon: Brain, defaultSection: 'smart' },
    { id: 'knowledge', label: 'المعرفة', icon: Layers3, defaultSection: 'flashcards' },
    { id: 'performance', label: 'الأداء', icon: ChartNoAxesCombined, defaultSection: 'analytics' },
    { id: 'banks', label: 'البنوك', icon: Database, defaultSection: 'banks' },
    { id: 'backup', label: 'النسخ', icon: ShieldCheck, defaultSection: 'backup' },
  ];

  const subSections: Partial<Record<StudyGroup, Array<{ id: Section; label: string }>>> = {
    study: [
      { id: 'smart', label: 'مراجعة ذكية' },
      { id: 'tools', label: 'بحث وإضافة' },
      { id: 'pomodoro', label: 'Pomodoro' },
    ],
    knowledge: [
      { id: 'flashcards', label: 'Flashcards' },
      { id: 'knowledge', label: 'قاموس وملاحظات' },
    ],
    performance: [
      { id: 'analytics', label: 'التحليلات' },
      { id: 'history', label: 'سجل الجلسات' },
    ],
  };

  const weakTopics = db.weakTopics();
  const smartQuestions = db.smartQuestionPool(20);
  const sessions = db.sessionHistory(100);
  const cards = flashcards();
  const dueCards = dueFlashcards();
  const glossary = glossaryItems();
  const notes = generalNotes();
  const activity = db.activityCalendar(84);
  const streak = db.studyStreak();
  const banks = db.banks();
  const selectedAnalyticsBankId = analyticsBankId === 'ALL' ? null : analyticsBankId;
  const analytics = db.dashboardAnalytics(selectedAnalyticsBankId);
  const analyticsActivity = db.getActivityStats(analyticsPeriod, selectedAnalyticsBankId);
  const analyticsSessions = selectedAnalyticsBankId
    ? sessions.filter((session) => session.bankId === selectedAnalyticsBankId)
    : sessions;
  const totalSessionMinutes = analyticsSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const averageSessionRate = analyticsSessions.length
    ? Math.round(analyticsSessions.reduce((sum, session) => sum + session.successRate, 0) / analyticsSessions.length)
    : 0;
  const toolResults = useMemo(
    () => toolQuery.trim().length >= 2 ? db.searchAcrossActiveDomain(toolQuery) : [],
    [toolQuery, section]
  );
  const notedQuestions = db.notedQuestions();

  const bankQuestions = useMemo(() => {
    const query = bankSearch.trim().toLowerCase();
    return db.questions(db.activeBankId())
      .filter((q) => !query || q.question.toLowerCase().includes(query) || q.topic.toLowerCase().includes(query))
      .slice(0, 100);
  }, [bankSearch, section]);

  const selectedCard = dueCards.length
    ? dueCards[Math.min(cardIndex, dueCards.length - 1)]
    : cards[Math.min(cardIndex, Math.max(cards.length - 1, 0))];

  useEffect(() => {
    void arabicTtsStatus().then(setTtsInfo);
    return () => { void stopArabicTts(); };
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setTimerRunning(false);
          if (!completedFocusRef.current) {
            const minutes = pomodoroMode === '25' ? 25 : pomodoroMode === '50' ? 50 : customMinutes;
            recordFocusMinutes(minutes);
            completedFocusRef.current = true;
            setStatus('اكتملت جلسة التركيز.');
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
              void audio.play();
            } catch {}
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, pomodoroMode, customMinutes]);

  const resetPomodoro = () => {
    setTimerRunning(false);
    completedFocusRef.current = false;
    const minutes = pomodoroMode === '25' ? 25 : pomodoroMode === '50' ? 50 : customMinutes;
    setRemainingSeconds(minutes * 60);
  };

  useEffect(() => {
    resetPomodoro();
  }, [pomodoroMode, customMinutes]);

  const saveEditor = () => {
    if (!editorDraft) return;
    try {
      db.updateQuestion(editorDraft.rowId, {
        question: editorDraft.question,
        correctAnswer: editorDraft.correctAnswer,
        wrong1: editorDraft.wrong1,
        wrong2: editorDraft.wrong2,
        wrong3: editorDraft.wrong3,
        explanation: editorDraft.explanation,
        topic: editorDraft.topic,
      });
      setEditorQuestion(null);
      setEditorDraft(null);
      setStatus('تم تحديث السؤال.');
      setRefresh((v) => v + 1);
    } catch (error: any) {
      setStatus(error?.message || 'تعذر تعديل السؤال.');
    }
  };

  const exportActiveBank = () => {
    const rows = db.questions(db.activeBankId()).map((q) => ({
      ID: q.externalId,
      السؤال: q.question,
      'الجواب الصحيح': q.correctAnswer,
      'خيار خاطئ 1': q.wrong1,
      'خيار خاطئ 2': q.wrong2,
      'خيار خاطئ 3': q.wrong3,
      الشرح: q.explanation,
      المحور: q.topic,
      النوع: q.questionType === 'TRUE_FALSE' ? 'TRUE_FALSE' : 'QCM',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Questions');
    XLSX.writeFile(wb, `${db.activeBank().name.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`);
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  const listeningText = smartQuestions.slice(0, 10).map((q, index) =>
    `السؤال رقم ${index + 1}. ${q.question}. الإجابة الصحيحة. ${q.correctAnswer}. ${q.explanation ? 'الشرح. ' + q.explanation : ''}`
  ).join('. ');

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <PurpleSubpageHeader title="مركز الدراسة" subtitle="أدوات التعلم والتحليل وإدارة المحتوى" onBack={onBack} />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {groups.map(({ id, label, icon: Icon, defaultSection }, index) => (
          <button
            key={id}
            onClick={() => { setSection(defaultSection); setStatus(''); }}
            className={`rounded-[17px] border p-3.5 flex items-center gap-3 text-right transition-all ${index === groups.length - 1 ? 'col-span-2 sm:col-span-1 ' : ''}${
              activeGroup === id ? 'bg-[#F5F3FF] border-[#5B3FD6] text-[#5B3FD6]' : 'bg-white border-gray-100 text-[#2C2145]'
            }`}
          >
            <div className="w-9 h-9 rounded-[11px] bg-white flex items-center justify-center shadow-xs">
              <Icon className="w-4.5 h-4.5" />
            </div>
            <span className="text-xs font-bold">{label}</span>
          </button>
        ))}
      </div>

      {subSections[activeGroup] && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {subSections[activeGroup]!.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSection(item.id); setStatus(''); }}
              className={`shrink-0 px-3 py-2 rounded-[11px] text-[11px] font-bold border ${
                section === item.id
                  ? 'bg-[#5B3FD6] text-white border-[#5B3FD6]'
                  : 'bg-white text-gray-600 border-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {status && (
        <div className="rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] px-3 py-2 text-xs font-semibold">{status}</div>
      )}

      {section === 'tools' && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={toolQuery}
              onChange={(e) => setToolQuery(e.target.value)}
              placeholder="ابحث في كل بنوك المجال..."
              className="w-full h-12 rounded-[16px] bg-white border border-gray-100 pr-10 pl-4 text-sm"
            />
          </div>

          {toolResults.map(({ question, bankName }) => {
            const current = noteDrafts[question.rowId] ?? db.questionNote(question.rowId);
            return (
              <div key={question.rowId} className="bg-white rounded-[17px] p-4 border border-gray-100">
                <div className="text-[10px] text-[#5B3FD6] font-bold">{bankName}</div>
                <div className="text-xs font-bold leading-5 mt-1">{question.question}</div>
                <textarea
                  value={current}
                  onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [question.rowId]: e.target.value }))}
                  placeholder="ملاحظة على السؤال..."
                  rows={2}
                  className="w-full mt-2 rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-2.5 text-xs"
                />
                <button
                  onClick={() => {
                    db.setQuestionNote(question.rowId, noteDrafts[question.rowId] ?? current);
                    setStatus('تم حفظ الملاحظة.');
                  }}
                  className="mt-2 px-3 py-2 rounded-[10px] bg-[#F5F3FF] text-[#5B3FD6] text-[11px] font-bold"
                >
                  حفظ الملاحظة
                </button>
              </div>
            );
          })}

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm mb-3">إضافة سؤال يدوي</div>
            <select
              value={manual.bankId}
              onChange={(e) => setManual((v) => ({ ...v, bankId: e.target.value }))}
              className="w-full rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm"
            >
              {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
            </select>
            {[
              ['question', 'السؤال'],
              ['correctAnswer', 'الإجابة الصحيحة'],
              ['wrong1', 'خيار خاطئ 1'],
              ['wrong2', 'خيار خاطئ 2'],
              ['wrong3', 'خيار خاطئ 3'],
              ['topic', 'المحور - اختياري'],
              ['explanation', 'الشرح - اختياري'],
            ].map(([key, label]) => (
              <textarea
                key={key}
                value={(manual as any)[key]}
                onChange={(e) => setManual((v) => ({ ...v, [key]: e.target.value }))}
                placeholder={label}
                rows={key === 'question' || key === 'explanation' ? 3 : 1}
                className="w-full mt-2 rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm"
              />
            ))}
            <button
              onClick={() => {
                try {
                  db.addManualQuestion(manual);
                  setManual({ ...manual, question: '', correctAnswer: '', wrong1: '', wrong2: '', wrong3: '', explanation: '', topic: '' });
                  setStatus('تمت إضافة السؤال.');
                  setRefresh((v) => v + 1);
                } catch (error: any) {
                  setStatus(error?.message || 'تعذر إضافة السؤال.');
                }
              }}
              className="w-full mt-3 py-3 rounded-[13px] bg-[#5B3FD6] text-white text-sm font-bold"
            >
              إضافة السؤال
            </button>
          </div>

          {notedQuestions.length > 0 && (
            <div className="bg-white rounded-[20px] p-4 border border-gray-100">
              <div className="font-bold text-sm mb-3">ملاحظات الأسئلة</div>
              {notedQuestions.slice(0, 20).map(({ question, note }) => (
                <div key={question.rowId} className="py-2 border-b border-gray-50 last:border-0">
                  <div className="text-xs font-bold leading-5">{question.question}</div>
                  <div className="text-[11px] text-gray-500 mt-1 whitespace-pre-wrap">{note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'smart' && (
        <div data-speech-scope className="flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white rounded-[18px] p-4 border border-gray-100">
              <Brain className="w-5 h-5 text-[#5B3FD6] mb-2" />
              <div className="text-xs text-gray-400">أسئلة مقترحة</div>
              <div className="text-2xl font-bold">{smartQuestions.length}</div>
            </div>
            <div className="bg-white rounded-[18px] p-4 border border-gray-100">
              <ChartNoAxesCombined className="w-5 h-5 text-[#5B3FD6] mb-2" />
              <div className="text-xs text-gray-400">محاور بها بيانات</div>
              <div className="text-2xl font-bold">{weakTopics.length}</div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm">وضع الاستماع</h3>
                <p className="text-[11px] text-gray-400 mt-1">
                  يقرأ حتى 10 أسئلة بالعربية عبر محرك Android.
                  {ttsInfo?.arabic ? ` • ${ttsInfo.locale || 'ar'}` : ttsInfo ? ' • لا يوجد صوت عربي مثبت' : ''}
                </p>
              </div>
              <SpeakButton text={listeningText} rate={0.9} compact={false} title="استماع"
                onError={setStatus} className="shrink-0 bg-[#F5F3FF] text-[#5B3FD6]" />
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <h3 className="font-bold text-sm mb-3">أضعف المحاور</h3>
            <div className="flex flex-col gap-2">
              {weakTopics.slice(0, 8).map((item) => (
                <div key={item.topic} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{item.topic}</div>
                    <div className="text-[10px] text-gray-400">{item.attempts} محاولة • {item.wrong} خطأ</div>
                  </div>
                  <div className={`text-xs font-bold ${item.successRate < 50 ? 'text-red-500' : item.successRate < 75 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {item.successRate}%
                  </div>
                </div>
              ))}
              {weakTopics.length === 0 && <div className="text-xs text-gray-400 text-center py-4">ابدأ الإجابة عن الأسئلة ليظهر تحليل الضعف.</div>}
            </div>
          </div>

          <div data-speech-text className="bg-white rounded-[20px] p-4 border border-gray-100">
            <h3 className="font-bold text-sm mb-3">أسئلة ذات أولوية للمراجعة</h3>
            <div className="flex flex-col gap-2">
              {smartQuestions.slice(0, 10).map((q) => (
                <div key={q.rowId} className="rounded-[14px] bg-[#F8F9FD] p-3">
                  <div className="text-xs font-bold leading-5">{q.question}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-gray-400">{q.topic || 'عام'}</span>
                    <button
                      onClick={() => {
                        try {
                          addFlashcard(q.question, q.correctAnswer, q.rowId);
                          setStatus('تمت إضافة السؤال إلى Flashcards.');
                          setRefresh((v) => v + 1);
                        } catch (error: any) {
                          setStatus(error?.message || 'تعذر إضافة البطاقة.');
                        }
                      }}
                      className="text-[10px] font-bold text-[#5B3FD6]"
                    >
                      + Flashcard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 'flashcards' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white rounded-[17px] p-4 border border-gray-100">
              <div className="text-xs text-gray-400">كل البطاقات</div>
              <div className="text-2xl font-bold">{cards.length}</div>
            </div>
            <div className="bg-white rounded-[17px] p-4 border border-gray-100">
              <div className="text-xs text-gray-400">مستحقة الآن</div>
              <div className="text-2xl font-bold text-[#5B3FD6]">{dueCards.length}</div>
            </div>
          </div>

          {selectedCard ? (
            <div data-speech-scope className="bg-white rounded-[22px] p-5 border border-gray-100 text-center min-h-56 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-gray-400">مراجعة البطاقات</span>
                <span className="text-[10px] font-bold text-[#5B3FD6]">{Math.min(cardIndex + 1, dueCards.length || cards.length)} / {dueCards.length || cards.length}</span>
              </div>
              <button data-speech-text onClick={() => setCardFlipped((v) => !v)} className="flex-1 flex items-center justify-center text-lg font-bold leading-8 px-2">
                {cardFlipped ? selectedCard.back : selectedCard.front}
              </button>
              <div className="text-[10px] text-gray-400 mt-2">اضغط على البطاقة لقلبها</div>
              <div className="flex justify-center gap-2 mt-4">
                <SpeakButton text={cardFlipped ? selectedCard.back : selectedCard.front}
                  title="قراءة البطاقة" onError={setStatus}
                  className="!w-10 !h-10 bg-[#F5F3FF] text-[#5B3FD6]" />
                <button onClick={() => { deleteFlashcard(selectedCard.id); setCardIndex(0); setRefresh((v) => v + 1); }}
                  className="w-10 h-10 rounded-[12px] bg-red-50 text-red-500 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {cardFlipped && (
                <div className="grid grid-cols-4 gap-1.5 mt-4">
                  {[
                    ['again', 'مرة أخرى'],
                    ['hard', 'صعب'],
                    ['good', 'جيد'],
                    ['easy', 'سهل'],
                  ].map(([grade, label]) => (
                    <button key={grade} onClick={() => {
                      gradeFlashcard(selectedCard.id, grade as any);
                      setCardFlipped(false);
                      setCardIndex((i) => Math.min(i + 1, Math.max(dueFlashcards().length - 1, 0)));
                      setRefresh((v) => v + 1);
                    }} className="py-2 rounded-[10px] bg-[#F8F9FD] text-[10px] font-bold">
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-[20px] p-6 border border-gray-100 text-center">
              <div className="text-sm font-bold text-[#2C2145]">لا توجد بطاقات للمراجعة</div>
              <div className="text-[11px] text-gray-400 mt-1">أضف بطاقة جديدة من النموذج بالأسفل.</div>
            </div>
          )}

          <div className="bg-white rounded-[20px] p-4 border border-gray-100 flex flex-col gap-2">
            <textarea value={cardFront} onChange={(e) => setCardFront(e.target.value)} placeholder="وجه البطاقة: السؤال أو المصطلح"
              className="rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm min-h-20" />
            <textarea value={cardBack} onChange={(e) => setCardBack(e.target.value)} placeholder="ظهر البطاقة: الإجابة أو التعريف"
              className="rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm min-h-20" />
            <button onClick={() => {
              try {
                addFlashcard(cardFront, cardBack);
                setCardFront(''); setCardBack('');
                setRefresh((v) => v + 1);
                setStatus('تمت إضافة البطاقة.');
              } catch (error: any) { setStatus(error?.message || 'تعذر إضافة البطاقة.'); }
            }} className="py-3 rounded-[13px] bg-[#5B3FD6] text-white text-sm font-bold flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> إضافة بطاقة
            </button>
          </div>

        </div>
      )}

      {section === 'history' && (
        <div className="flex flex-col gap-2">
          {sessions.length === 0 ? (
            <div className="bg-white rounded-[18px] p-6 text-center text-xs text-gray-400 border border-gray-100">لا توجد جلسات بعد.</div>
          ) : sessions.map((session) => (
            <div key={session.id} className="bg-white rounded-[18px] p-4 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">{session.bankName}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{new Date(session.startedAt).toLocaleString('ar-MA')}</div>
                </div>
                <div className="text-lg font-bold text-[#5B3FD6]">{session.successRate}%</div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
                <div className="rounded-[10px] bg-[#F8F9FD] p-2"><div className="text-[10px] text-gray-400">المدة</div><b className="text-xs">{session.durationMinutes}د</b></div>
                <div className="rounded-[10px] bg-[#F8F9FD] p-2"><div className="text-[10px] text-gray-400">أجاب</div><b className="text-xs">{session.answered}</b></div>
                <div className="rounded-[10px] bg-emerald-50 p-2"><div className="text-[10px] text-emerald-600">صحيح</div><b className="text-xs">{session.correct}</b></div>
                <div className="rounded-[10px] bg-red-50 p-2"><div className="text-[10px] text-red-500">خطأ</div><b className="text-xs">{session.wrong}</b></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === 'pomodoro' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-[24px] p-6 border border-gray-100 text-center">
            <div className="text-xs text-gray-400">وقت التركيز اليوم</div>
            <div className="text-lg font-bold text-[#5B3FD6] mt-1">{focusMinutesToday()} دقيقة</div>
            <div className="text-5xl font-bold tracking-wider mt-8">{formatTime(remainingSeconds)}</div>
            <div className="grid grid-cols-3 gap-2 mt-6">
              {[
                ['25', '25 / 5'],
                ['50', '50 / 10'],
                ['custom', 'مخصص'],
              ].map(([id, label]) => (
                <button key={id} onClick={() => setPomodoroMode(id as any)}
                  className={`py-2.5 rounded-[12px] text-xs font-bold border ${pomodoroMode === id ? 'bg-[#5B3FD6] text-white border-[#5B3FD6]' : 'border-gray-100'}`}>
                  {label}
                </button>
              ))}
            </div>
            {pomodoroMode === 'custom' && (
              <input type="number" min={1} max={180} value={customMinutes}
                onChange={(e) => setCustomMinutes(Math.min(Math.max(Number(e.target.value) || 1, 1), 180))}
                className="mt-3 w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm" />
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => { completedFocusRef.current = false; setTimerRunning((v) => !v); }}
                className="flex-1 py-3 rounded-[13px] bg-[#5B3FD6] text-white font-bold flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> {timerRunning ? 'إيقاف مؤقت' : 'ابدأ'}
              </button>
              <button onClick={resetPomodoro}
                className="w-12 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {section === 'knowledge' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm mb-3">قاموس المصطلحات</div>
            <div className="grid grid-cols-1 gap-2">
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="المصطلح"
                className="rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm" />
              <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder="التعريف"
                className="rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm min-h-20" />
              <button onClick={() => {
                try {
                  addGlossaryItem(term, definition); setTerm(''); setDefinition('');
                  setRefresh((v) => v + 1); setStatus('تم حفظ المصطلح.');
                } catch (error: any) { setStatus(error?.message || 'تعذر الحفظ.'); }
              }} className="py-3 rounded-[13px] bg-[#5B3FD6] text-white text-sm font-bold">حفظ المصطلح</button>
            </div>
          </div>

          {glossary.map((item) => (
            <div data-speech-scope key={item.id} className="bg-white rounded-[17px] p-4 border border-gray-100">
              <div className="flex justify-between gap-3">
                <div data-speech-text>
                  <div className="font-bold text-sm">{item.term}</div>
                  <div className="text-xs text-gray-600 leading-6 mt-1">{item.definition}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <SpeakButton text={`${item.term}. ${item.definition}`} title="قراءة التعريف"
                    onError={setStatus} className="bg-[#F5F3FF] text-[#5B3FD6]" />
                  <button onClick={() => { deleteGlossaryItem(item.id); setRefresh((v) => v + 1); }} className="w-8 h-8 rounded-[9px] bg-red-50 text-red-500 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm mb-3">ملاحظات عامة</div>
            <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="عنوان الملاحظة"
              className="w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm" />
            <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="الملاحظة..."
              className="w-full mt-2 rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm min-h-28" />
            <button onClick={() => {
              try {
                saveGeneralNote({ title: noteTitle, body: noteBody }); setNoteTitle(''); setNoteBody('');
                setRefresh((v) => v + 1); setStatus('تم حفظ الملاحظة.');
              } catch (error: any) { setStatus(error?.message || 'تعذر الحفظ.'); }
            }} className="w-full mt-2 py-3 rounded-[13px] bg-[#5B3FD6] text-white text-sm font-bold">حفظ الملاحظة</button>
          </div>

          {notes.map((note) => (
            <div key={note.id} className="bg-white rounded-[17px] p-4 border border-gray-100">
              <div className="font-bold text-sm">{note.title}</div>
              <div className="text-xs text-gray-600 whitespace-pre-wrap leading-6 mt-1">{note.body}</div>
              <button onClick={() => { deleteGeneralNote(note.id); setRefresh((v) => v + 1); }}
                className="mt-2 text-red-500 text-xs font-bold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> حذف</button>
            </div>
          ))}
        </div>
      )}

      {section === 'banks' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-sm">فحص البنك النشط</div>
                <div className="text-[11px] text-gray-400">{db.activeBank().name}</div>
              </div>
              <button onClick={exportActiveBank} className="px-3 py-2 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] text-xs font-bold flex items-center gap-1.5">
                <FileDown className="w-3.5 h-3.5" /> XLSX
              </button>
            </div>
            {(() => {
              const report = db.bankValidation();
              return (
                <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
                  <div className="rounded-[10px] bg-[#F8F9FD] p-2"><div className="text-[9px] text-gray-400">الكل</div><b className="text-xs">{report.total}</b></div>
                  <div className="rounded-[10px] bg-amber-50 p-2"><div className="text-[9px] text-amber-600">مكرر</div><b className="text-xs">{report.duplicates}</b></div>
                  <div className="rounded-[10px] bg-red-50 p-2"><div className="text-[9px] text-red-500">ناقص</div><b className="text-xs">{report.incomplete}</b></div>
                  <div className="rounded-[10px] bg-orange-50 p-2"><div className="text-[9px] text-orange-500">ID مكرر</div><b className="text-xs">{report.duplicateIds}</b></div>
                </div>
              );
            })()}
          </div>

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm mb-3">مقارنة بنكين</div>
            {banks.length < 2 ? (
              <div className="text-xs text-gray-400">تحتاج إلى بنكين على الأقل لإجراء المقارنة.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select value={compareA} onChange={(e) => setCompareA(e.target.value)}
                    className="rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-2.5 text-xs">
                    {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                  </select>
                  <select value={compareB} onChange={(e) => setCompareB(e.target.value)}
                    className="rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-2.5 text-xs">
                    {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                  </select>
                </div>
                {compareA && compareB && compareA !== compareB && (() => {
                  const result = db.compareBanks(compareA, compareB);
                  return (
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div className="rounded-[11px] bg-[#F8F9FD] p-2">
                        <div className="text-[9px] text-gray-400">مشتركة</div>
                        <div className="font-bold text-sm">{result.shared}</div>
                      </div>
                      <div className="rounded-[11px] bg-[#F5F3FF] p-2">
                        <div className="text-[9px] text-[#5B3FD6]">فقط الأول</div>
                        <div className="font-bold text-sm">{result.onlyA}</div>
                      </div>
                      <div className="rounded-[11px] bg-[#F5F3FF] p-2">
                        <div className="text-[9px] text-[#5B3FD6]">فقط الثاني</div>
                        <div className="font-bold text-sm">{result.onlyB}</div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm mb-2">دمج بنوك</div>
            <div className="flex flex-col gap-2">
              {banks.map((bank) => (
                <label key={bank.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={selectedMergeBanks.includes(bank.id)}
                    onChange={(e) => setSelectedMergeBanks((current) => e.target.checked ? [...current, bank.id] : current.filter((id) => id !== bank.id))} />
                  {bank.name}
                </label>
              ))}
            </div>
            <input value={mergedName} onChange={(e) => setMergedName(e.target.value)} className="w-full mt-3 rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm" />
            <button onClick={() => {
              try {
                db.mergeBanks(selectedMergeBanks, mergedName);
                setSelectedMergeBanks([]);
                setStatus('تم إنشاء البنك المدمج بدون الأسئلة المكررة.');
                setRefresh((v) => v + 1);
              } catch (error: any) { setStatus(error?.message || 'تعذر الدمج.'); }
            }} className="w-full mt-2 py-3 rounded-[13px] bg-[#5B3FD6] text-white text-sm font-bold">دمج البنوك</button>
          </div>

          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={bankSearch} onChange={(e) => setBankSearch(e.target.value)} placeholder="ابحث لتعديل سؤال..."
              className="w-full h-12 rounded-[16px] bg-white border border-gray-100 pr-10 pl-4 text-sm" />
          </div>

          {bankQuestions.map((q) => (
            <div key={q.rowId} className="bg-white rounded-[17px] p-3 border border-gray-100">
              <div className="text-xs font-bold leading-5">{q.question}</div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button onClick={() => { setEditorQuestion(q); setEditorDraft({ ...q }); }} className="text-[10px] font-bold text-[#5B3FD6]">تعديل</button>
                <button onClick={() => {
                  db.duplicateQuestion(q.rowId);
                  setRefresh((v) => v + 1); setStatus('تم نسخ السؤال.');
                }} className="text-[10px] font-bold text-emerald-600">نسخ</button>
                <button onClick={() => {
                  if (!window.confirm('حذف هذا السؤال من البنك؟')) return;
                  db.deleteQuestion(q.rowId); setRefresh((v) => v + 1); setStatus('تم حذف السؤال.');
                }} className="text-[10px] font-bold text-red-500">حذف</button>
                <select value={db.questionDifficulty(q.rowId)} onChange={(e) => {
                  db.setQuestionDifficulty(q.rowId, e.target.value as any); setRefresh((v) => v + 1);
                }} className="ml-auto text-[10px] bg-[#F8F9FD] rounded-[9px] p-1.5">
                  <option value="">الصعوبة</option>
                  <option value="easy">سهل</option>
                  <option value="medium">متوسط</option>
                  <option value="hard">صعب</option>
                </select>
                <button onClick={() => {
                  const current = db.questionTags(q.rowId);
                  const raw = window.prompt('الوسوم مفصولة بفاصلة', current.join(', '));
                  if (raw !== null) {
                    db.setQuestionTags(q.rowId, raw.split(','));
                    setRefresh((v) => v + 1);
                  }
                }} className="w-8 h-8 rounded-[9px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center">
                  <Tags className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {editorQuestion && editorDraft && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center p-3" onClick={() => { setEditorQuestion(null); setEditorDraft(null); }}>
              <div className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-white rounded-[24px] p-4 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="font-bold text-base mb-1">تعديل السؤال</div>
                {[
                  ['question', 'السؤال'],
                  ['correctAnswer', 'الإجابة الصحيحة'],
                  ['wrong1', 'خيار خاطئ 1'],
                  ['wrong2', 'خيار خاطئ 2'],
                  ['wrong3', 'خيار خاطئ 3'],
                  ['topic', 'المحور'],
                  ['explanation', 'الشرح'],
                ].map(([key, label]) => (
                  <textarea key={key} value={(editorDraft as any)[key]} onChange={(e) => setEditorDraft((v) => v ? ({ ...v, [key]: e.target.value }) : v)}
                    placeholder={label} rows={key === 'question' || key === 'explanation' ? 3 : 1}
                    className="rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm" />
                ))}
                <button onClick={saveEditor} className="py-3 rounded-[13px] bg-[#5B3FD6] text-white font-bold text-sm flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> حفظ التعديل
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'analytics' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-[20px] p-3 border border-gray-100">
            <label className="text-[11px] font-bold text-gray-500">نطاق الإحصائيات</label>
            <select
              value={analyticsBankId}
              onChange={(e) => setAnalyticsBankId(e.target.value)}
              className="w-full mt-2 rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm font-semibold"
            >
              <option value="ALL">كل بنوك المجال</option>
              {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-[22px] p-4 border border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-gray-400">نسبة النجاح العامة</div>
                <div className="text-4xl font-black text-[#2C2145] mt-1">{analytics.stats.successRate}%</div>
                <div className="text-[10px] text-gray-400 mt-1">{analytics.stats.answered} إجابة مسجلة</div>
              </div>
              <div className={`px-3 py-2 rounded-[12px] text-xs font-bold flex items-center gap-1.5 ${
                analytics.weeklyDelta > 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : analytics.weeklyDelta < 0
                    ? 'bg-red-50 text-red-600'
                    : 'bg-gray-100 text-gray-500'
              }`}>
                {analytics.weeklyDelta > 0
                  ? <TrendingUp className="w-4 h-4" />
                  : analytics.weeklyDelta < 0
                    ? <TrendingDown className="w-4 h-4" />
                    : <RotateCcw className="w-4 h-4" />}
                {analytics.weeklyDelta > 0 ? '+' : ''}{analytics.weeklyDelta}%
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-[13px] bg-[#F8F9FD] p-3">
                <div className="text-[10px] text-gray-400">هذا الأسبوع</div>
                <div className="font-black text-lg">{analytics.currentWeek.rate}%</div>
                <div className="text-[10px] text-gray-400">{analytics.currentWeek.total} إجابة</div>
              </div>
              <div className="rounded-[13px] bg-[#F8F9FD] p-3">
                <div className="text-[10px] text-gray-400">الأسبوع السابق</div>
                <div className="font-black text-lg">{analytics.previousWeek.rate}%</div>
                <div className="text-[10px] text-gray-400">{analytics.previousWeek.total} إجابة</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[
              { icon: CheckCircle2, label: 'صحيح', value: analytics.stats.correct, cls: 'bg-emerald-50 text-emerald-700' },
              { icon: XCircle, label: 'خطأ', value: analytics.stats.wrong, cls: 'bg-red-50 text-red-600' },
              { icon: Target, label: 'مستحق', value: analytics.dueReview, cls: 'bg-amber-50 text-amber-700' },
              { icon: BookOpen, label: 'جديد', value: analytics.unseen, cls: 'bg-[#F5F3FF] text-[#5B3FD6]' },
            ].map(({ icon: Icon, label, value, cls }) => (
              <div key={label} className={`rounded-[14px] p-2.5 text-center ${cls}`}>
                <Icon className="w-4 h-4 mx-auto mb-1" />
                <div className="text-base font-black">{value}</div>
                <div className="text-[9px] font-bold">{label}</div>
              </div>
            ))}
          </div>

          <ActivityBarChart
            buckets={analyticsActivity}
            period={analyticsPeriod}
            onPeriodChange={setAnalyticsPeriod}
            banks={banks}
            selectedBankId={analyticsBankId}
            onBankChange={setAnalyticsBankId}
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-[18px] p-4 border border-gray-100">
              <div className="text-[10px] text-gray-400">Streak الحالي</div>
              <div className="text-2xl font-black text-[#5B3FD6] mt-1">{streak}</div>
              <div className="text-[9px] text-gray-400">يوم متتالٍ</div>
            </div>
            <div className="bg-white rounded-[18px] p-4 border border-gray-100">
              <div className="text-[10px] text-gray-400">جلسات مسجلة</div>
              <div className="text-2xl font-black mt-1">{analyticsSessions.length}</div>
              <div className="text-[9px] text-gray-400">{totalSessionMinutes} دقيقة إجمالًا</div>
            </div>
            <div className="bg-white rounded-[18px] p-4 border border-gray-100">
              <div className="text-[10px] text-gray-400">متوسط نتائج الجلسات</div>
              <div className="text-2xl font-black mt-1">{averageSessionRate}%</div>
            </div>
            <div className="bg-white rounded-[18px] p-4 border border-gray-100">
              <div className="text-[10px] text-gray-400">الأسئلة الجاهزة</div>
              <div className="text-2xl font-black mt-1">{analytics.playableQuestions}</div>
              <div className="text-[9px] text-gray-400">من {analytics.totalQuestions}</div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm mb-3">نشاط آخر 12 أسبوعًا</div>
            <div className="grid grid-cols-14 gap-1">
              {activity.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.total}`}
                  className={`aspect-square rounded-[4px] ${
                    day.total === 0 ? 'bg-gray-100' : day.total < 10 ? 'bg-[#DDD5FF]' : day.total < 30 ? 'bg-[#A58EF4]' : 'bg-[#5B3FD6]'
                  }`}
                />
              ))}
            </div>
          </div>

          {analytics.weakTopics.length > 0 && (
            <div className="bg-white rounded-[20px] p-4 border border-gray-100">
              <div className="font-bold text-sm mb-3">أضعف المحاور</div>
              <div className="flex flex-col gap-3">
                {analytics.weakTopics.map((item) => (
                  <div key={item.topic}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="min-w-0">
                        <span className="font-bold truncate block">{item.topic}</span>
                        <span className="text-[9px] text-gray-400">{item.wrong} خطأ من {item.attempts} محاولة</span>
                      </div>
                      <span className="font-black text-red-500">{item.successRate}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${item.successRate}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analytics.strongTopics.length > 0 && (
            <div className="bg-white rounded-[20px] p-4 border border-gray-100">
              <div className="font-bold text-sm mb-3">أقوى المحاور</div>
              <div className="flex flex-col gap-2">
                {analytics.strongTopics.map((item) => (
                  <div key={item.topic} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{item.topic}</div>
                      <div className="text-[9px] text-gray-400">{item.attempts} محاولة</div>
                    </div>
                    <div className="text-emerald-600 font-black text-sm">{item.successRate}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analytics.topMistakes.length > 0 && (
            <div className="bg-white rounded-[20px] p-4 border border-gray-100">
              <div className="font-bold text-sm mb-3">أكثر الأسئلة خطأ</div>
              <div className="flex flex-col gap-2">
                {analytics.topMistakes.map((item) => (
                  <div key={item.question.rowId} className="rounded-[13px] bg-red-50/60 p-3">
                    <div className="text-xs font-bold leading-5">{item.question.question}</div>
                    <div className="text-[10px] text-red-500 mt-1">{item.wrongCount} مرات خطأ</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analytics.stats.answered === 0 && (
            <div className="bg-white rounded-[18px] p-5 border border-gray-100 text-center text-xs text-gray-400">
              ابدأ الإجابة عن الأسئلة والجلسات ليظهر تحليل الأداء التفصيلي هنا.
            </div>
          )}
        </div>
      )}

      {section === 'backup' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm">نسخة احتياطية كاملة</div>
            <p className="text-xs text-gray-500 leading-6 mt-2">تشمل البنوك والأسئلة والتقدم والمفضلة والملاحظات والإعدادات وبيانات الأدوات المخزنة داخل قاعدة التطبيق.</p>
            <button onClick={() => downloadText(`study-backup-${new Date().toISOString().slice(0, 10)}.json`, db.exportBackup())}
              className="w-full mt-3 py-3 rounded-[13px] bg-[#5B3FD6] text-white text-sm font-bold flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> تصدير النسخة الاحتياطية
            </button>
          </div>

          <input ref={backupInputRef} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (!window.confirm('استعادة النسخة ستستبدل بيانات التطبيق الحالية. هل تريد المتابعة؟')) return;
            try {
              db.importBackup(await file.text());
              setStatus('تمت استعادة النسخة الاحتياطية.');
              setRefresh((v) => v + 1);
            } catch (error: any) {
              setStatus(error?.message || 'ملف النسخة الاحتياطية غير صالح.');
            }
          }} />
          <button onClick={() => backupInputRef.current?.click()}
            className="w-full py-3 rounded-[13px] bg-white border border-[#5B3FD6]/20 text-[#5B3FD6] text-sm font-bold flex items-center justify-center gap-2">
            <FileUp className="w-4 h-4" /> استعادة نسخة احتياطية
          </button>
        </div>
      )}
    </div>
  );
};
