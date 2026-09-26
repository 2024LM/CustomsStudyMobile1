import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Brain,
  Cards,
  ChartNoAxesCombined,
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
import { ScreenHeader } from '../components/ScreenHeader';
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

type Section =
  | 'smart'
  | 'flashcards'
  | 'history'
  | 'pomodoro'
  | 'knowledge'
  | 'banks'
  | 'analytics'
  | 'backup';

function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ar-MA';
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

export const AdvancedStudyPage: React.FC = () => {
  const [section, setSection] = useState<Section>('smart');
  const [status, setStatus] = useState('');
  const [, setRefresh] = useState(0);

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

  const backupInputRef = useRef<HTMLInputElement>(null);

  const sections = [
    { id: 'smart' as const, label: 'مراجعة ذكية', icon: Brain },
    { id: 'flashcards' as const, label: 'Flashcards', icon: Cards },
    { id: 'history' as const, label: 'سجل الجلسات', icon: ListChecks },
    { id: 'pomodoro' as const, label: 'Pomodoro', icon: Clock3 },
    { id: 'knowledge' as const, label: 'المعرفة', icon: NotebookPen },
    { id: 'banks' as const, label: 'مختبر البنوك', icon: Database },
    { id: 'analytics' as const, label: 'التحليلات', icon: ChartNoAxesCombined },
    { id: 'backup' as const, label: 'نسخ احتياطي', icon: ShieldCheck },
  ];

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

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <ScreenHeader title="مركز المراجعة المتقدم" subtitle="أدوات التعلم والتحليل وإدارة المحتوى" />

      <div className="grid grid-cols-2 gap-2">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setSection(id); setStatus(''); }}
            className={`rounded-[17px] border p-3.5 flex items-center gap-3 text-right transition-all ${
              section === id ? 'bg-[#F5F3FF] border-[#5B3FD6] text-[#5B3FD6]' : 'bg-white border-gray-100 text-[#2C2145]'
            }`}
          >
            <div className="w-9 h-9 rounded-[11px] bg-white flex items-center justify-center shadow-xs">
              <Icon className="w-4.5 h-4.5" />
            </div>
            <span className="text-xs font-bold">{label}</span>
          </button>
        ))}
      </div>

      {status && (
        <div className="rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] px-3 py-2 text-xs font-semibold">{status}</div>
      )}

      {section === 'smart' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
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

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
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
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-[17px] p-4 border border-gray-100">
              <div className="text-xs text-gray-400">كل البطاقات</div>
              <div className="text-2xl font-bold">{cards.length}</div>
            </div>
            <div className="bg-white rounded-[17px] p-4 border border-gray-100">
              <div className="text-xs text-gray-400">مستحقة الآن</div>
              <div className="text-2xl font-bold text-[#5B3FD6]">{dueCards.length}</div>
            </div>
          </div>

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

          {selectedCard && (
            <div className="bg-white rounded-[22px] p-5 border border-gray-100 text-center min-h-56 flex flex-col justify-between">
              <button onClick={() => setCardFlipped((v) => !v)} className="flex-1 flex items-center justify-center text-lg font-bold leading-8">
                {cardFlipped ? selectedCard.back : selectedCard.front}
              </button>
              <div className="flex justify-center gap-2 mt-4">
                <button onClick={() => speak(cardFlipped ? selectedCard.back : selectedCard.front)}
                  className="w-10 h-10 rounded-[12px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center">
                  <Volume2 className="w-4 h-4" />
                </button>
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
          )}
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
            <div key={item.id} className="bg-white rounded-[17px] p-4 border border-gray-100">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="font-bold text-sm">{item.term}</div>
                  <div className="text-xs text-gray-600 leading-6 mt-1">{item.definition}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => speak(`${item.term}. ${item.definition}`)} className="w-8 h-8 rounded-[9px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center"><Headphones className="w-3.5 h-3.5" /></button>
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
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-[18px] p-4 border border-gray-100">
              <div className="text-xs text-gray-400">Streak الحالي</div>
              <div className="text-3xl font-bold text-[#5B3FD6] mt-1">{streak}</div>
              <div className="text-[10px] text-gray-400">يوم متتالٍ</div>
            </div>
            <div className="bg-white rounded-[18px] p-4 border border-gray-100">
              <div className="text-xs text-gray-400">جلسات مسجلة</div>
              <div className="text-3xl font-bold mt-1">{sessions.length}</div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm mb-3">Heatmap آخر 12 أسبوعًا</div>
            <div className="grid grid-cols-14 gap-1">
              {activity.map((day) => (
                <div key={day.date} title={`${day.date}: ${day.total}`}
                  className={`aspect-square rounded-[4px] ${day.total === 0 ? 'bg-gray-100' : day.total < 10 ? 'bg-[#DDD5FF]' : day.total < 30 ? 'bg-[#A58EF4]' : 'bg-[#5B3FD6]'}`} />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-4 border border-gray-100">
            <div className="font-bold text-sm mb-3">أداء المحاور</div>
            {weakTopics.map((item) => (
              <div key={item.topic} className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold truncate">{item.topic}</span>
                  <span>{item.successRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-[#5B3FD6] rounded-full" style={{ width: `${item.successRate}%` }} />
                </div>
              </div>
            ))}
          </div>
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
