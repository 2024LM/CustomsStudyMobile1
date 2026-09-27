import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as mammoth from 'mammoth';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  LoaderCircle,
  RefreshCcw,
  Send,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { db } from '../services/db';
import {
  addAiMessage,
  AiWorkspaceState,
  loadAiWorkspace,
  resetAiWorkspace,
  saveAiWorkspace,
} from '../services/aiOrchestrator';
import {
  aiReady,
  generateBankFromSources,
  GeneratedBankQuestion,
  runStudyAssistant,
} from '../services/geminiAi';
import {
  fetchReferenceContent,
  fetchReferenceDocx,
  fetchReferenceIndex,
  ReferenceItem,
} from '../services/references';
import { ExcelPreview } from '../types';

interface AiAssistantPageProps {
  onOpenSettings: () => void;
}

function canReadReference(item: ReferenceItem): boolean {
  const t = item.type.toLowerCase();
  return t.includes('md') || t.includes('txt') || t.includes('google') || t.includes('docx') || t.includes('word');
}

async function referenceText(item: ReferenceItem): Promise<string> {
  const t = item.type.toLowerCase();
  if (t.includes('docx') || t.includes('word')) {
    const buffer = await fetchReferenceDocx(item);
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    if (!result.value.trim()) throw new Error(`المرجع «${item.title}» لا يحتوي نصًا قابلًا للقراءة.`);
    return result.value;
  }
  return fetchReferenceContent(item);
}

export const AiAssistantPage: React.FC<AiAssistantPageProps> = ({ onOpenSettings }) => {
  const [workspace, setWorkspace] = useState<AiWorkspaceState>(() => loadAiWorkspace());
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [generated, setGenerated] = useState<GeneratedBankQuestion[]>([]);
  const [status, setStatus] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void aiReady().then((value) => {
      if (active) {
        setReady(value);
        setChecking(false);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setRefsLoading(true);
    void fetchReferenceIndex()
      .then((result) => setReferences(result.items.filter(canReadReference)))
      .catch(() => setReferences([]))
      .finally(() => setRefsLoading(false));
  }, [ready]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [workspace.messages.length, busy]);

  const analytics = db.dashboardAnalytics(null);
  const banks = db.banks();

  const selectedReferences = useMemo(
    () => references.filter((item) => workspace.task.sourceIds.includes(item.id)),
    [references, workspace.task.sourceIds]
  );

  const updateWorkspace = (next: AiWorkspaceState) => {
    setWorkspace(saveAiWorkspace(next));
  };

  const toggleSource = (item: ReferenceItem) => {
    const exists = workspace.task.sourceIds.includes(item.id);
    const sourceIds = exists
      ? workspace.task.sourceIds.filter((id) => id !== item.id)
      : [...workspace.task.sourceIds, item.id].slice(0, 5);
    const sourceUrls = references.filter((ref) => sourceIds.includes(ref.id)).map((ref) => ref.url);
    updateWorkspace({
      ...workspace,
      task: {
        ...workspace.task,
        sourceIds,
        sourceUrls,
        status: sourceIds.length ? 'collecting' : workspace.task.status,
        updatedAt: Date.now(),
      },
    });
  };

  const generateBank = async (state: AiWorkspaceState) => {
    if (!state.task.bankName.trim() || !state.task.topic.trim()) {
      throw new Error('اسم البنك والموضوع مطلوبان قبل التوليد.');
    }
    const sources = references.filter((item) => state.task.sourceIds.includes(item.id));
    if (!sources.length) throw new Error('اختر مرجعًا واحدًا على الأقل قبل إنشاء البنك.');

    setStatus('جاري قراءة المراجع المحددة…');
    const loaded = [];
    for (const source of sources) {
      loaded.push({
        title: source.title,
        url: source.url,
        text: await referenceText(source),
      });
    }

    const generatingState = saveAiWorkspace({
      ...state,
      task: { ...state.task, status: 'generating', updatedAt: Date.now() },
    });
    setWorkspace(generatingState);
    setStatus('جاري إنشاء الأسئلة من المصادر فقط…');

    const questions = await generateBankFromSources({
      bankName: state.task.bankName,
      topic: state.task.topic,
      count: state.task.expectedQuestions,
      sources: loaded,
    });
    if (!questions.length) throw new Error('لم يتم إنشاء أسئلة صالحة من المراجع المحددة.');

    setGenerated(questions);
    const reviewState = addAiMessage(
      {
        ...generatingState,
        task: { ...generatingState.task, status: 'review', updatedAt: Date.now() },
      },
      'assistant',
      `أنشأت ${questions.length} سؤالًا اعتمادًا على ${sources.length} مرجع. راجع المعاينة ثم اضغط «حفظ البنك» إذا كانت النتيجة مناسبة.`
    );
    setWorkspace(reviewState);
    setStatus('');
  };

  const send = async (preset?: string) => {
    const text = (preset ?? message).trim();
    if (!text || busy || !ready) return;

    setMessage('');
    setBusy(true);
    setStatus('');
    let state = addAiMessage(workspace, 'user', text);
    setWorkspace(state);

    try {
      const decision = await runStudyAssistant({
        message: text,
        task: {
          kind: state.task.kind,
          status: state.task.status,
          bankName: state.task.bankName,
          topic: state.task.topic,
          sourceUrls: state.task.sourceUrls,
          expectedQuestions: state.task.expectedQuestions,
        },
        app: {
          activeDomain: db.activeDomain().name,
          activeBank: db.activeBank().name,
          banks: banks.map((bank) => ({
            id: bank.id,
            name: bank.name,
            questions: db.questions(bank.id).length,
          })),
          stats: {
            answered: analytics.stats.answered,
            correct: analytics.stats.correct,
            wrong: analytics.stats.wrong,
            successRate: analytics.stats.successRate,
            dueReview: analytics.dueReview,
            unseen: analytics.unseen,
            weakTopics: analytics.weakTopics,
            strongTopics: analytics.strongTopics,
          },
          references: references.slice(0, 40).map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            url: item.url,
            type: item.type,
          })),
        },
        recentMessages: state.messages.slice(-8).map((item) => ({ role: item.role, text: item.text })),
      });

      const nextTask = {
        ...state.task,
        kind: decision.intent,
        status: decision.taskStatus,
        bankName: decision.bankName || state.task.bankName,
        topic: decision.topic || state.task.topic,
        expectedQuestions: decision.expectedQuestions || state.task.expectedQuestions,
        updatedAt: Date.now(),
      };
      state = addAiMessage({ ...state, task: nextTask }, 'assistant', decision.reply);
      setWorkspace(state);

      if (decision.requestSources && state.task.sourceIds.length === 0) setShowSources(true);
      if (decision.shouldGenerateBank) {
        await generateBank(state);
      }
    } catch (error: any) {
      const textError = error?.message || 'حدث خطأ أثناء تنفيذ طلب المساعد.';
      const failed = addAiMessage(
        { ...state, task: { ...state.task, status: 'error', lastError: textError, updatedAt: Date.now() } },
        'assistant',
        textError
      );
      setWorkspace(failed);
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const saveBank = () => {
    if (!generated.length) return;
    try {
      const preview: ExcelPreview = {
        sourceName: 'Gemini AI Workspace',
        valid: true,
        errors: [],
        rows: generated.map((item, index) => ({
          externalId: `ai_${Date.now().toString(36)}_${index + 1}`,
          questionType: 'QCM',
          question: item.question,
          answer: item.correctAnswer,
          wrong1: item.wrong1,
          wrong2: item.wrong2,
          wrong3: item.wrong3,
          explanation: item.explanation,
          topic: item.topic || workspace.task.topic,
        })),
      };
      const bankId = db.importQuestionBank(
        workspace.task.bankName || 'بنك AI',
        `بنك أنشئ بمساعدة Gemini من ${workspace.task.sourceUrls.length} مرجع بعد معاينة المستخدم.`,
        preview
      );
      db.setActiveBank(bankId);
      const done = addAiMessage(
        {
          ...workspace,
          task: { ...workspace.task, status: 'done', generatedBankId: bankId, updatedAt: Date.now() },
        },
        'assistant',
        `تم حفظ البنك «${workspace.task.bankName}» وتفعيله داخل التطبيق بنجاح.`
      );
      setWorkspace(done);
      setGenerated([]);
      setStatus('تم إنشاء البنك وتفعيله.');
    } catch (error: any) {
      setStatus(error?.message || 'تعذر حفظ البنك.');
    }
  };

  const clearWorkspace = () => {
    if (!window.confirm('بدء محادثة ومهمة جديدة؟')) return;
    setWorkspace(resetAiWorkspace());
    setGenerated([]);
    setStatus('');
    setShowSources(false);
  };

  if (checking) {
    return <div className="py-20 flex justify-center"><LoaderCircle className="w-6 h-6 animate-spin text-[#5B3FD6]" /></div>;
  }

  if (!ready) {
    return (
      <div className="flex flex-col gap-4 pb-8 text-right">
        <div className="-mx-4 -mt-4 px-5 pt-6 pb-6 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[15px] bg-white/15 flex items-center justify-center"><Sparkles className="w-6 h-6" /></div>
            <div><h1 className="text-lg font-black">مساعد الدراسة AI</h1><p className="text-xs text-[#DDD5FF] mt-1">مساعد منظم داخل التطبيق</p></div>
          </div>
        </div>
        <div className="bg-white rounded-[22px] p-6 border border-gray-100 text-center">
          <Bot className="w-10 h-10 text-[#5B3FD6] mx-auto mb-3" />
          <h2 className="font-bold">الذكاء الاصطناعي غير جاهز</h2>
          <p className="text-xs text-gray-500 mt-2 leading-6">فعّل Gemini وأضف API Key ثم اختبر الاتصال. بعد نجاح الاختبار ستظهر واجهة المساعد.</p>
          <button onClick={onOpenSettings} className="mt-4 h-12 px-5 rounded-[14px] bg-[#5B3FD6] text-white font-bold text-sm inline-flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> إعداد Gemini
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-24 text-right">
      <div className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
            <div><h1 className="font-black text-lg">مساعد الدراسة AI</h1><p className="text-xs text-[#DDD5FF]">التطبيق يدير المهمة • Gemini ينفذ الخطوة الحالية</p></div>
          </div>
          <button onClick={clearWorkspace} className="w-10 h-10 rounded-[12px] bg-white/15 flex items-center justify-center" aria-label="مهمة جديدة">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {workspace.task.status !== 'idle' && (
        <div className="bg-white rounded-[18px] border border-[#E9E4F8] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Database className="w-4 h-4 text-[#5B3FD6]" /><span className="text-xs font-black">المهمة الحالية</span></div>
            <span className="text-[10px] font-bold text-[#5B3FD6] bg-[#F5F3FF] px-2 py-1 rounded-full">{workspace.task.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
            <div className="bg-[#F8F9FD] rounded-[10px] p-2"><span className="text-gray-400">البنك</span><div className="font-bold mt-1 truncate">{workspace.task.bankName || 'غير محدد'}</div></div>
            <div className="bg-[#F8F9FD] rounded-[10px] p-2"><span className="text-gray-400">الموضوع</span><div className="font-bold mt-1 truncate">{workspace.task.topic || 'غير محدد'}</div></div>
            <div className="bg-[#F8F9FD] rounded-[10px] p-2"><span className="text-gray-400">المراجع</span><div className="font-bold mt-1">{workspace.task.sourceIds.length}</div></div>
            <div className="bg-[#F8F9FD] rounded-[10px] p-2"><span className="text-gray-400">الأسئلة</span><div className="font-bold mt-1">{workspace.task.expectedQuestions}</div></div>
          </div>
          {workspace.task.kind === 'bank' && (
            <button onClick={() => setShowSources((v) => !v)} className="w-full mt-2 h-9 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] text-[11px] font-bold flex items-center justify-center gap-1">
              اختيار المراجع <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSources ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {showSources && (
        <div className="bg-white rounded-[18px] border border-gray-100 p-3">
          <div className="font-bold text-xs mb-2">مراجع التطبيق المتاحة</div>
          {refsLoading ? (
            <div className="py-5 flex justify-center"><LoaderCircle className="w-5 h-5 animate-spin text-[#5B3FD6]" /></div>
          ) : references.length === 0 ? (
            <div className="text-[11px] text-gray-400 py-3">لا توجد مراجع نصية متاحة حاليًا.</div>
          ) : (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {references.map((item) => {
                const selected = workspace.task.sourceIds.includes(item.id);
                return (
                  <button key={item.id} onClick={() => toggleSource(item)} className={`p-3 rounded-[12px] border text-right ${selected ? 'border-[#5B3FD6] bg-[#F5F3FF]' : 'border-gray-100 bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold">{item.title}</span>
                      {selected && <CheckCircle2 className="w-4 h-4 text-[#5B3FD6] shrink-0" />}
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1 line-clamp-2">{item.description}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {[
          'حلل تقدمي واقترح ما أراجعه',
          'أريد إنشاء بنك أسئلة جديد',
          'اقترح مراجع مناسبة من المكتبة',
          'لخص نقاط ضعفي الحالية',
        ].map((prompt) => (
          <button key={prompt} onClick={() => void send(prompt)} disabled={busy} className="px-3 py-2 rounded-full bg-white border border-gray-100 text-[10px] font-bold text-[#5B3FD6] disabled:opacity-50">
            {prompt}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 min-h-[260px]">
        {workspace.messages.length === 0 && (
          <div className="py-10 text-center">
            <Bot className="w-10 h-10 text-[#B4A6E8] mx-auto" />
            <h2 className="font-bold text-sm mt-3">ماذا تريد أن تنجز؟</h2>
            <p className="text-[11px] text-gray-400 mt-2 leading-5">يمكنني تنظيم إنشاء بنك من مراجع التطبيق، تحليل تقدمك، اقتراح ما تراجع، أو مساعدتك في إعداد موضوع دراسة.</p>
          </div>
        )}
        {workspace.messages.map((item) => (
          <div key={item.id} className={`max-w-[88%] rounded-[17px] px-3.5 py-3 text-xs leading-6 whitespace-pre-wrap ${item.role === 'user' ? 'self-start bg-[#5B3FD6] text-white rounded-tr-[5px]' : 'self-end bg-white border border-gray-100 text-[#3D3550] rounded-tl-[5px]'}`}>
            {item.text}
          </div>
        ))}
        {busy && (
          <div className="self-end bg-white border border-gray-100 rounded-[17px] px-4 py-3 flex items-center gap-2 text-[11px] text-gray-400">
            <LoaderCircle className="w-4 h-4 animate-spin" /> {status || 'جاري التفكير في الخطوة التالية…'}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {generated.length > 0 && (
        <div className="bg-white rounded-[20px] border border-[#DDD5FF] p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="font-black text-sm">معاينة البنك</h3><p className="text-[10px] text-gray-400 mt-1">{generated.length} سؤال • من المراجع المختارة فقط</p></div>
            <button onClick={saveBank} className="h-10 px-4 rounded-[12px] bg-[#16864B] text-white text-[11px] font-bold">حفظ البنك</button>
          </div>
          <div className="mt-3 max-h-80 overflow-y-auto flex flex-col gap-2">
            {generated.map((q, i) => (
              <div key={i} className="rounded-[12px] bg-[#F8F9FD] p-3">
                <div className="text-[10px] font-bold text-[#5B3FD6]">سؤال {i + 1}</div>
                <div className="text-xs font-bold mt-1 leading-5">{q.question}</div>
                <div className="text-[10px] text-emerald-700 mt-2">✓ {q.correctAnswer}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {status && !busy && <div className="rounded-[12px] bg-[#F5F3FF] text-[#5B3FD6] px-3 py-2 text-[11px]">{status}</div>}

      <div className="fixed bottom-[66px] left-0 right-0 z-30 px-4 pointer-events-none">
        <div className="max-w-md sm:max-w-2xl mx-auto flex items-end gap-2 pointer-events-auto">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 3000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="اكتب طلبك للمساعد…"
            className="flex-1 max-h-28 resize-none rounded-[18px] bg-white border border-[#E5E0F2] shadow-lg px-4 py-3 text-sm outline-none focus:border-[#5B3FD6]"
          />
          <button onClick={() => void send()} disabled={busy || !message.trim()} className="w-12 h-12 rounded-[16px] bg-[#5B3FD6] text-white flex items-center justify-center shadow-lg disabled:opacity-40">
            {busy ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 rotate-180" />}
          </button>
        </div>
      </div>
    </div>
  );
};
