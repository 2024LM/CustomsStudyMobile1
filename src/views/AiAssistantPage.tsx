import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { db } from '../services/db';
import {
  addAiMessage,
  AiRichContentBlock,
  AiWorkspaceState,
  loadAiWorkspace,
  resetAiWorkspace,
  saveAiWorkspace,
} from '../services/aiOrchestrator';
import {
  aiReady,
  generateBankFromMixedSources,
  GeneratedBankQuestion,
  MixedAiSource,
  runStudyAssistant,
  searchRichWebContent,
  searchWebReferences,
  WebReferenceCandidate,
} from '../services/geminiAi';
import { ExcelPreview } from '../types';
import { AiSourcePicker } from '../components/AiSourcePicker';

interface AiAssistantPageProps {
  onOpenSettings: () => void;
}

function sourceDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function asksForWebSearch(text: string): boolean {
  const value = text.trim().toLocaleLowerCase('ar');
  return [
    'ابحث', 'إبحث', 'بحث عنه', 'ابحث عنه', 'ابحث عنها', 'فتش',
    'مصادر', 'مراجع', 'روابط', 'تحقق من', 'تأكد من'
  ].some((token) => value.includes(token.toLocaleLowerCase('ar')));
}

function richContentIntent(text: string): 'youtube' | 'images' | 'links' | null {
  const value = text.trim().toLocaleLowerCase('ar');
  const wantsYoutube =
    value.includes('يوتيوب') ||
    value.includes('youtube') ||
    value.includes('فيديوهات') ||
    value.includes('فيديوهات تعليم') ||
    (value.includes('دروس') && value.includes('فيديو'));

  if (wantsYoutube) return 'youtube';

  const wantsImages =
    value.includes('صور') ||
    value.includes('صورة') ||
    value.includes('خرائط') ||
    value.includes('خريطة');
  if (wantsImages) return 'images';

  const bankLanguage =
    value.includes('بنك') ||
    value.includes('أسئلة') ||
    value.includes('انشاء بنك') ||
    value.includes('إنشاء بنك') ||
    value.includes('اعتماد مصادر');

  if (!bankLanguage && (value.includes('روابط') || value.includes('مواقع مفيدة') || value.includes('مراجع مفيدة'))) {
    return 'links';
  }

  return null;
}

function shouldUseSourcePicker(text: string, taskKind: string): boolean {
  const value = text.trim().toLocaleLowerCase('ar');
  const bankLanguage =
    taskKind === 'bank' ||
    value.includes('بنك') ||
    value.includes('أسئلة') ||
    value.includes('اعتماد مصادر') ||
    value.includes('اختر مصادر');

  return bankLanguage && (
    value.includes('مصادر') ||
    value.includes('مراجع') ||
    value.includes('ابحث') ||
    value.includes('روابط')
  );
}

function freshChatTask(task: AiWorkspaceState['task']): AiWorkspaceState['task'] {
  return {
    ...task,
    kind: 'chat',
    status: 'idle',
    title: '',
    bankName: '',
    topic: '',
    sourceIds: [],
    sourceUrls: [],
    sourceTitles: [],
    generatedBankId: undefined,
    lastError: undefined,
    updatedAt: Date.now(),
  };
}

function previousUserTopic(messages: AiWorkspaceState['messages'], currentText: string): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i];
    if (item.role !== 'user') continue;
    const value = item.text.trim();
    if (!value || value === currentText.trim()) continue;
    if (asksForWebSearch(value) && value.length < 40) continue;
    return value.slice(0, 300);
  }
  return '';
}

function attachmentKind(source: MixedAiSource): 'image' | 'pdf' | 'file' | 'bank' | 'reference' | 'url' {
  if (source.kind === 'url') return 'url';
  if (source.kind === 'inline' && source.mimeType?.startsWith('image/')) return 'image';
  if (source.kind === 'inline' && source.mimeType === 'application/pdf') return 'pdf';
  if (source.title.startsWith('بنك:')) return 'bank';
  if (source.title.startsWith('مرجع:')) return 'reference';
  return 'file';
}

function dedupeSources(sources: MixedAiSource[]): MixedAiSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.id || source.url || source.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

export const AiAssistantPage: React.FC<AiAssistantPageProps> = ({ onOpenSettings }) => {
  const [workspace, setWorkspace] = useState<AiWorkspaceState>(() => loadAiWorkspace());
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [candidates, setCandidates] = useState<WebReferenceCandidate[]>(() => {
    const saved = loadAiWorkspace().task;
    return saved.sourceUrls.map((url, index) => ({
      url,
      title: saved.sourceTitles[index] || sourceDomain(url),
      domain: sourceDomain(url),
      note: 'مصدر محفوظ في المهمة',
    }));
  });
  const [generated, setGenerated] = useState<GeneratedBankQuestion[]>([]);
  const [localSources, setLocalSources] = useState<MixedAiSource[]>([]);
  const [taskLocalSources, setTaskLocalSources] = useState<MixedAiSource[]>([]);
  const [sentAttachmentPayloads, setSentAttachmentPayloads] = useState<Record<string, MixedAiSource[]>>({});
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
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [workspace.messages.length, busy]);

  const analytics = db.dashboardAnalytics(null);
  const banks = db.banks();

  const updateWorkspace = (next: AiWorkspaceState) => {
    setWorkspace(saveAiWorkspace(next));
  };

  const setSelectedUrls = (nextUrls: string[]) => {
    const selected = candidates.filter((item) => nextUrls.includes(item.url));
    updateWorkspace({
      ...workspace,
      task: {
        ...workspace.task,
        sourceIds: [],
        sourceUrls: selected.map((item) => item.url),
        sourceTitles: selected.map((item) => item.title),
        status: selected.length ? 'collecting' : workspace.task.status,
        updatedAt: Date.now(),
      },
    });
  };

  const toggleSource = (item: WebReferenceCandidate) => {
    const exists = workspace.task.sourceUrls.includes(item.url);
    const next = exists
      ? workspace.task.sourceUrls.filter((url) => url !== item.url)
      : [...workspace.task.sourceUrls, item.url].slice(0, 5);
    setSelectedUrls(next);
  };

  const addLocalSource = (source: MixedAiSource) => {
    setLocalSources((current) => {
      if (current.some((item) => item.id === source.id)) return current;
      if (current.length >= 8) {
        setStatus('يمكن إضافة 8 مصادر محلية كحد أقصى للمهمة الواحدة.');
        return current;
      }
      return [...current, source];
    });
  };

  const removeLocalSource = (id: string) => {
    setLocalSources((current) => current.filter((item) => item.id !== id));
  };

  const searchSources = async (topicOverride?: string, baseState: AiWorkspaceState = workspace) => {
    const topic = (topicOverride || baseState.task.topic).trim();
    if (!topic) {
      setStatus('حدد الموضوع أولًا حتى أبحث عن مراجع مناسبة.');
      return;
    }

    setSourceBusy(true);
    setStatus('Gemini يبحث في الويب عن مراجع مناسبة…');
    setShowSources(true);
    try {
      const result = await searchWebReferences(topic);
      setCandidates(result.candidates);
      const cleared = {
        ...baseState,
        task: {
          ...baseState.task,
          sourceIds: [],
          sourceUrls: [],
          sourceTitles: [],
          status: 'collecting' as const,
          updatedAt: Date.now(),
        },
      };
      const next = addAiMessage(
        cleared,
        'assistant',
        `وجدت ${result.candidates.length} مصادر من الويب حول «${topic}». افتح ما تريد للتأكد منه، ثم اختر حتى 5 مراجع واضغط «اعتماد المراجع المختارة».`
      );
      setWorkspace(next);
      setStatus('');
    } catch (error: any) {
      setStatus(error?.message || 'تعذر البحث عن المراجع.');
    } finally {
      setSourceBusy(false);
    }
  };

  const generateBank = async (state: AiWorkspaceState, localTaskSources: MixedAiSource[] = taskLocalSources) => {
    if (!state.task.bankName.trim() || !state.task.topic.trim()) {
      throw new Error('اسم البنك والموضوع مطلوبان قبل التوليد.');
    }
    if (!state.task.sourceUrls.length && !localTaskSources.length) {
      throw new Error('أضف مصدرًا واحدًا على الأقل قبل إنشاء البنك.');
    }

    const generatingState = saveAiWorkspace({
      ...state,
      task: { ...state.task, status: 'generating', updatedAt: Date.now() },
    });
    setWorkspace(generatingState);
    setStatus('Gemini يقرأ الروابط المختارة وينشئ الأسئلة منها…');

    const questions = await generateBankFromMixedSources({
      bankName: state.task.bankName,
      topic: state.task.topic,
      count: state.task.expectedQuestions,
      sources: [
        ...state.task.sourceUrls.map((url, index) => ({
          id: 'web_' + index,
          title: state.task.sourceTitles[index] || sourceDomain(url),
          kind: 'url' as const,
          url,
        })),
        ...localTaskSources,
      ],
    });

    if (!questions.length) throw new Error('لم يتم إنشاء أسئلة صالحة من الروابط المختارة.');

    setGenerated(questions);
    const reviewState = addAiMessage(
      {
        ...generatingState,
        task: { ...generatingState.task, status: 'review', updatedAt: Date.now() },
      },
      'assistant',
      `أنشأت ${questions.length} سؤالًا من ${state.task.sourceUrls.length + localTaskSources.length} مصدر محدد. راجع المعاينة قبل الحفظ.`
    );
    setWorkspace(reviewState);
    setStatus('');
  };

  const runRichSearch = async (
    kind: 'youtube' | 'images' | 'links',
    query: string,
    baseState: AiWorkspaceState
  ) => {
    const label = kind === 'youtube' ? 'فيديوهات YouTube' : kind === 'images' ? 'صور' : 'روابط';
    setStatus(`جارٍ البحث عن ${label}…`);

    const results = await searchRichWebContent(query, kind);
    const block: AiRichContentBlock = {
      type: 'rich_content',
      title: kind === 'youtube'
        ? 'فيديوهات مقترحة'
        : kind === 'images'
          ? 'صور مرتبطة بالموضوع'
          : 'روابط مفيدة',
      items: results.map((item, index) => ({
        id: `${kind}_${Date.now().toString(36)}_${index}`,
        type: item.type,
        title: item.title,
        url: item.url,
        subtitle: item.subtitle,
        thumbnailUrl: item.thumbnailUrl,
      })),
    };

    const reply = kind === 'youtube'
      ? 'هذه فيديوهات YouTube مرتبطة بطلبك، مرتبة لسهولة الاختيار.'
      : kind === 'images'
        ? 'هذه صور مرتبطة بالموضوع من روابط مباشرة عثر عليها البحث.'
        : 'هذه روابط مفيدة مرتبطة بطلبك.';

    const next = addAiMessage(baseState, 'assistant', reply, [], [block]);
    setWorkspace(next);
    setStatus('');
    return next;
  };

  const send = async (preset?: string) => {
    const text = (preset ?? message).trim();
    const hasAttachments = localSources.length > 0 || workspace.task.sourceUrls.length > 0;
    if ((!text && !hasAttachments) || busy || !ready) return;

    const pendingSources = [...localSources];
    const nextTaskLocalSources = dedupeSources([...taskLocalSources, ...pendingSources]);
    const attachments = pendingSources.map((source) => ({
      id: source.id,
      title: source.title,
      kind: attachmentKind(source),
      mimeType: source.mimeType,
    }));

    setMessage('');
    setLocalSources([]);
    setTaskLocalSources(nextTaskLocalSources);
    setBusy(true);
    setStatus('');

    const userText = text || 'حلّل المصادر المرفقة.';
    let state = addAiMessage(workspace, 'user', userText, attachments);
    const sentMessage = state.messages[state.messages.length - 1];
    if (sentMessage && pendingSources.length) {
      setSentAttachmentPayloads((current) => ({ ...current, [sentMessage.id]: pendingSources }));
    }
    setWorkspace(state);

    try {
      const directRichIntent = richContentIntent(userText);
      if (directRichIntent) {
        const freshState: AiWorkspaceState = {
          ...state,
          task: freshChatTask(state.task),
        };
        setWorkspace(freshState);
        setCandidates([]);
        setShowSources(false);
        setGenerated([]);
        setTaskLocalSources([]);
        await runRichSearch(directRichIntent, userText, freshState);
        return;
      }

      const activeSources: MixedAiSource[] = [
        ...state.task.sourceUrls.map((url, index) => ({
          id: 'web_chat_' + index,
          title: state.task.sourceTitles[index] || sourceDomain(url),
          kind: 'url' as const,
          url,
        })),
        ...nextTaskLocalSources,
      ];

      const decision = await runStudyAssistant({
        message: userText,
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
          references: [],
        },
        recentMessages: state.messages.slice(-8).map((item) => ({ role: item.role, text: item.text })),
      }, activeSources);

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

      const explicitSourceSearch = shouldUseSourcePicker(userText, nextTask.kind);
      const fallbackTopic = previousUserTopic(state.messages, userText);
      const searchTopic = (nextTask.topic || state.task.topic || fallbackTopic || '').trim();
      const sourcePickerRequested = decision.requestSources && nextTask.kind === 'bank';

      if ((sourcePickerRequested || explicitSourceSearch) && searchTopic && nextTask.sourceUrls.length === 0) {
        await searchSources(searchTopic, state);
      } else if ((sourcePickerRequested || explicitSourceSearch) && !searchTopic) {
        const asking = addAiMessage(
          state,
          'assistant',
          'ما الموضوع الذي تريد أن أبحث له عن مصادر؟'
        );
        setWorkspace(asking);
      }

      if (decision.shouldGenerateBank && (nextTask.sourceUrls.length > 0 || nextTaskLocalSources.length > 0)) {
        await generateBank({ ...state, task: nextTask }, nextTaskLocalSources);
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

  const acceptSources = async () => {
    const availableLocalSources = dedupeSources([...taskLocalSources, ...localSources]);
    if (!workspace.task.sourceUrls.length && !availableLocalSources.length) {
      setStatus('اختر أو أضف مصدرًا واحدًا على الأقل.');
      return;
    }
    const next = addAiMessage(
      {
        ...workspace,
        task: { ...workspace.task, status: 'ready', updatedAt: Date.now() },
      },
      'assistant',
      `تم اعتماد ${workspace.task.sourceUrls.length + availableLocalSources.length} مصادر للمهمة. سأستخدم هذه المصادر فقط في إنشاء البنك.`
    );
    setWorkspace(next);

    if (next.task.bankName && next.task.topic) {
      setBusy(true);
      try { await generateBank(next, availableLocalSources); }
      catch (error: any) { setStatus(error?.message || 'تعذر إنشاء البنك.'); }
      finally { setBusy(false); }
    } else {
      setStatus('المراجع جاهزة. أكمل اسم البنك أو الموضوع في المحادثة.');
    }
  };

  const saveBank = () => {
    if (!generated.length) return;
    try {
      const preview: ExcelPreview = {
        sourceName: 'Gemini Web References',
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
        `بنك أنشئ بمساعدة Gemini من ${workspace.task.sourceUrls.length + taskLocalSources.length} مصادر اختارها المستخدم.`,
        preview
      );
      db.setActiveBank(bankId);

      const done = addAiMessage(
        {
          ...workspace,
          task: { ...workspace.task, status: 'done', generatedBankId: bankId, updatedAt: Date.now() },
        },
        'assistant',
        `تم حفظ البنك «${workspace.task.bankName}» وتفعيله داخل التطبيق.`
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
    setCandidates([]);
    setGenerated([]);
    setLocalSources([]);
    setTaskLocalSources([]);
    setSentAttachmentPayloads({});
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
            <div><h1 className="text-lg font-black">مساعد الدراسة AI</h1><p className="text-xs text-[#DDD5FF] mt-1">المساعد المنظم داخل التطبيق</p></div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#211D2C] rounded-[22px] p-6 border border-gray-100 dark:border-[#373043] text-center">
          <Bot className="w-10 h-10 text-[#7B5BE7] mx-auto mb-3" />
          <h2 className="font-bold text-[#2C2145] dark:text-white">الذكاء الاصطناعي غير جاهز</h2>
          <p className="text-xs text-gray-500 dark:text-[#BDB5CC] mt-2 leading-6">فعّل Gemini وأضف API Key ثم اختبر الاتصال.</p>
          <button onClick={onOpenSettings} className="mt-4 h-12 px-5 rounded-[14px] bg-[#5B3FD6] text-white font-bold text-sm inline-flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> إعداد Gemini
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-assistant-page flex flex-col gap-3 pb-40 text-right text-[#2C2145] dark:text-[#F1EDF8]">
      <div className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></div>
            <div className="min-w-0">
              <h1 className="font-black text-lg">مساعد الدراسة AI</h1>
              <p className="text-xs text-[#E4DEFF] mt-0.5">التطبيق يدير الخطة • Gemini ينفذ الخطوة الحالية</p>
            </div>
          </div>
          <button onClick={clearWorkspace} className="w-10 h-10 rounded-[12px] bg-white/15 flex items-center justify-center shrink-0" aria-label="مهمة جديدة">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {workspace.task.status !== 'idle' && (
        <div className="bg-white dark:bg-[#211D2C] rounded-[18px] border border-[#E9E4F8] dark:border-[#3A314A] p-3 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Database className="w-4 h-4 text-[#7B5BE7]" /><span className="text-xs font-black">المهمة الحالية</span></div>
            <span className="text-[10px] font-bold text-[#6A49D8] dark:text-[#C6B8FF] bg-[#F5F3FF] dark:bg-[#302844] px-2 py-1 rounded-full">{workspace.task.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
            <div className="bg-[#F8F9FD] dark:bg-[#191621] rounded-[10px] p-2"><span className="text-gray-400 dark:text-[#9D95AC]">البنك</span><div className="font-bold mt-1 truncate">{workspace.task.bankName || 'غير محدد'}</div></div>
            <div className="bg-[#F8F9FD] dark:bg-[#191621] rounded-[10px] p-2"><span className="text-gray-400 dark:text-[#9D95AC]">الموضوع</span><div className="font-bold mt-1 truncate">{workspace.task.topic || 'غير محدد'}</div></div>
            <div className="bg-[#F8F9FD] dark:bg-[#191621] rounded-[10px] p-2"><span className="text-gray-400 dark:text-[#9D95AC]">المصادر</span><div className="font-bold mt-1">{workspace.task.sourceUrls.length + taskLocalSources.length + localSources.length}</div></div>
            <div className="bg-[#F8F9FD] dark:bg-[#191621] rounded-[10px] p-2"><span className="text-gray-400 dark:text-[#9D95AC]">الأسئلة</span><div className="font-bold mt-1">{workspace.task.expectedQuestions}</div></div>
          </div>

          {(workspace.task.kind === 'bank' || workspace.task.kind === 'references') && (
            <button
              onClick={() => workspace.task.topic ? void searchSources() : setStatus('حدد الموضوع أولًا.')}
              disabled={sourceBusy}
              className="w-full mt-3 h-10 rounded-[12px] bg-[#F5F3FF] dark:bg-[#302844] text-[#5B3FD6] dark:text-[#C8BAFF] text-[11px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sourceBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              البحث عن مراجع على الويب
            </button>
          )}
        </div>
      )}

      {workspace.task.sourceUrls.length > 0 && (
        <div className="bg-white dark:bg-[#211D2C] rounded-[18px] border border-gray-100 dark:border-[#373043] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="w-4 h-4 text-[#7B5BE7]" />
            <span className="text-xs font-black">مصادر المهمة المعتمدة</span>
          </div>
          <div className="flex flex-col gap-2">
            {workspace.task.sourceUrls.map((url, index) => (
              <div key={url} className="rounded-[11px] bg-[#F8F9FD] dark:bg-[#191621] px-3 py-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold truncate">{workspace.task.sourceTitles[index] || sourceDomain(url)}</div>
                  <div className="text-[9px] text-gray-400 dark:text-[#9D95AC] truncate mt-0.5">{sourceDomain(url)}</div>
                </div>
                <a href={url} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-[9px] bg-white dark:bg-[#292435] border border-gray-100 dark:border-[#3A3348] flex items-center justify-center text-[#5B3FD6]">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {[
          'حلل تقدمي واقترح ما أراجعه',
          'أريد إنشاء بنك أسئلة جديد',
          'ابحث عن مراجع لموضوع أدرسه',
          'لخص نقاط ضعفي الحالية',
        ].map((prompt) => (
          <button
            key={prompt}
            onClick={() => void send(prompt)}
            disabled={busy}
            className="min-h-11 px-3 py-2.5 rounded-[14px] bg-white dark:bg-[#211D2C] border border-gray-100 dark:border-[#373043] text-[10px] leading-4 font-bold text-[#5B3FD6] dark:text-[#C8BAFF] disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 min-h-[260px]">
        {workspace.messages.length === 0 && (
          <div className="py-10 text-center">
            <Bot className="w-10 h-10 text-[#8B6FE8] mx-auto" />
            <h2 className="font-bold text-sm mt-3">ماذا تريد أن تنجز؟</h2>
            <p className="text-[11px] text-gray-500 dark:text-[#B1A9BD] mt-2 leading-6">يمكنني إدارة مهمة كاملة: تحديد المطلوب، البحث عن مراجع ويب، انتظار اختيارك، ثم إنشاء بنك أو تحليل تقدمك.</p>
          </div>
        )}

        {workspace.messages.map((item) => {
          const payloads = sentAttachmentPayloads[item.id] || [];
          return (
            <div key={item.id} className={`max-w-[88%] rounded-[17px] px-3.5 py-3 text-xs leading-6 ${item.role === 'user' ? 'self-start bg-[#5B3FD6] text-white rounded-tr-[5px]' : 'self-end bg-white dark:bg-[#211D2C] border border-gray-100 dark:border-[#373043] text-[#3D3550] dark:text-[#E7E1EF] rounded-tl-[5px]'}`}>
              {item.attachments?.length ? (
                <div className="flex flex-wrap gap-2 mb-2">
                  {item.attachments.map((attachment) => {
                    const payload = payloads.find((source) => source.id === attachment.id);
                    const imageSource = attachment.kind === 'image' && payload?.base64 && payload.mimeType
                      ? `data:${payload.mimeType};base64,${payload.base64}`
                      : '';

                    if (imageSource) {
                      return (
                        <div key={attachment.id} className="w-28 h-28 rounded-[14px] overflow-hidden bg-black/10 border border-white/20">
                          <img src={imageSource} alt={attachment.title} className="w-full h-full object-cover" />
                        </div>
                      );
                    }

                    return (
                      <div key={attachment.id} className={`max-w-[210px] rounded-[12px] px-3 py-2 flex items-center gap-2 ${item.role === 'user' ? 'bg-white/15 border border-white/15' : 'bg-[#F8F9FD] dark:bg-[#191621] border border-gray-100 dark:border-[#3A3348]'}`}>
                        <div className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${item.role === 'user' ? 'bg-white/15' : 'bg-[#F0ECFF] dark:bg-[#302844] text-[#5B3FD6]'}`}>
                          {attachment.kind === 'image' ? <ImageIcon className="w-4 h-4" /> : attachment.kind === 'bank' ? <Database className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold truncate">{attachment.title}</div>
                          <div className={`text-[9px] mt-0.5 ${item.role === 'user' ? 'text-white/70' : 'text-gray-400'}`}>
                            {attachment.kind === 'pdf' ? 'PDF' : attachment.kind === 'image' ? 'صورة' : attachment.kind === 'bank' ? 'بنك أسئلة' : attachment.kind === 'reference' ? 'مرجع' : attachment.kind === 'url' ? 'رابط' : 'ملف'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {item.blocks?.map((block, blockIndex) => (
                <div key={`${item.id}_block_${blockIndex}`} className="mt-2 mb-2">
                  <div className={`text-[10px] font-black mb-2 ${item.role === 'user' ? 'text-white/85' : 'text-[#5B3FD6] dark:text-[#C8BAFF]'}`}>
                    {block.title}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                    {block.items.map((richItem, index) => (
                      richItem.type === 'youtube' ? (
                        <a
                          key={richItem.id}
                          href={richItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-56 shrink-0 snap-start rounded-[14px] overflow-hidden bg-white dark:bg-[#191621] border border-gray-100 dark:border-[#3A3348] text-[#2C2145] dark:text-white no-underline"
                        >
                          <div className="relative aspect-video bg-gray-100 dark:bg-[#111] overflow-hidden">
                            {richItem.thumbnailUrl ? (
                              <img src={richItem.thumbnailUrl} alt={richItem.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><Globe2 className="w-6 h-6 text-gray-400" /></div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-black/70 text-white flex items-center justify-center">
                                <span className="text-sm pr-0.5">▶</span>
                              </div>
                            </div>
                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-[9px] font-black">YT</div>
                          </div>
                          <div className="p-3">
                            <div className="text-[11px] font-bold leading-5 line-clamp-2">{index + 1}. {richItem.title}</div>
                            {richItem.subtitle && <div className="text-[9px] text-gray-400 mt-1 truncate">{richItem.subtitle}</div>}
                          </div>
                        </a>
                      ) : richItem.type === 'image' ? (
                        <a
                          key={richItem.id}
                          href={richItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-44 shrink-0 snap-start rounded-[14px] overflow-hidden bg-white dark:bg-[#191621] border border-gray-100 dark:border-[#3A3348] no-underline"
                        >
                          <div className="aspect-square bg-gray-100 dark:bg-[#111]">
                            <img
                              src={richItem.thumbnailUrl || richItem.url}
                              alt={richItem.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-2.5 text-[#2C2145] dark:text-white">
                            <div className="text-[10px] font-bold line-clamp-2">{richItem.title}</div>
                            {richItem.subtitle && <div className="text-[9px] text-gray-400 mt-1 truncate">{richItem.subtitle}</div>}
                          </div>
                        </a>
                      ) : (
                        <a
                          key={richItem.id}
                          href={richItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-64 shrink-0 snap-start rounded-[14px] bg-white dark:bg-[#191621] border border-gray-100 dark:border-[#3A3348] p-3 text-[#2C2145] dark:text-white no-underline"
                        >
                          <div className="flex items-start gap-2">
                            <div className="w-9 h-9 rounded-[10px] bg-[#F0ECFF] dark:bg-[#302844] text-[#5B3FD6] flex items-center justify-center shrink-0">
                              <ExternalLink className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold leading-5 line-clamp-2">{richItem.title}</div>
                              {richItem.subtitle && <div className="text-[9px] text-gray-400 mt-1 truncate">{richItem.subtitle}</div>}
                            </div>
                          </div>
                        </a>
                      )
                    ))}
                  </div>
                </div>
              ))}

              <div className="whitespace-pre-wrap">{item.text}</div>
            </div>
          );
        })}

        {busy && (
          <div className="self-end bg-white dark:bg-[#211D2C] border border-gray-100 dark:border-[#373043] rounded-[17px] px-4 py-3 flex items-center gap-2 text-[11px] text-gray-500 dark:text-[#B1A9BD]">
            <LoaderCircle className="w-4 h-4 animate-spin" /> {status || 'جاري تحديد الخطوة التالية…'}
          </div>
        )}
        <div ref={endRef} />
      </div>

            {showSources && (
        <div className="bg-white dark:bg-[#211D2C] rounded-[20px] border border-[#DDD5FF] dark:border-[#493B66] overflow-hidden">
          <div className="p-4 border-b border-[#EEEAF8] dark:border-[#352D43] flex items-center justify-between gap-3">
            <div>
              <div className="font-black text-sm flex items-center gap-2"><Globe2 className="w-4 h-4 text-[#7B5BE7]" />اختر مراجع الويب</div>
              <div className="text-[10px] text-gray-400 dark:text-[#A39AAD] mt-1">افتح المصدر إن أردت، ثم اختر حتى 5 روابط</div>
            </div>
            <button onClick={() => setShowSources(false)} className="w-8 h-8 rounded-full text-gray-400 flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>

          <div className="p-3 flex flex-col gap-2 max-h-[48vh] overflow-y-auto">
            {sourceBusy ? (
              <div className="py-8 flex flex-col items-center gap-2 text-xs text-gray-400">
                <LoaderCircle className="w-6 h-6 animate-spin text-[#7B5BE7]" />
                Gemini يبحث عبر Google…
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-7 text-center text-xs text-gray-400">ابدأ البحث ليظهر هنا أفضل المصادر.</div>
            ) : (
              candidates.map((item) => {
                const selected = workspace.task.sourceUrls.includes(item.url);
                return (
                  <div key={item.url} className={`rounded-[15px] border p-3 transition-all ${selected ? 'border-[#6E50DD] bg-[#F6F3FF] dark:bg-[#302844]' : 'border-gray-100 dark:border-[#373043] bg-white dark:bg-[#1B1823]'}`}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleSource(item)}
                        className={`w-6 h-6 rounded-[7px] border-2 flex items-center justify-center shrink-0 mt-0.5 ${selected ? 'bg-[#5B3FD6] border-[#5B3FD6] text-white' : 'border-gray-300 dark:border-[#5A5266]'}`}
                        aria-label={selected ? 'إلغاء اختيار المرجع' : 'اختيار المرجع'}
                      >
                        {selected && <CheckCircle2 className="w-4 h-4" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs leading-5">{item.title}</div>
                        <div className="text-[10px] text-[#6E50DD] dark:text-[#BBAAFF] mt-1">{item.domain || sourceDomain(item.url)}</div>
                        <div className="text-[9px] text-gray-400 dark:text-[#9D95AC] mt-1 line-clamp-2">{item.note}</div>
                      </div>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-9 h-9 rounded-[10px] bg-[#F5F3FF] dark:bg-[#292238] text-[#5B3FD6] dark:text-[#C8BAFF] flex items-center justify-center shrink-0"
                        aria-label="فتح المرجع"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {candidates.length > 0 && (
            <div className="p-3 border-t border-[#EEEAF8] dark:border-[#352D43]">
              <button
                onClick={() => void acceptSources()}
                disabled={workspace.task.sourceUrls.length === 0 || busy}
                className="w-full h-12 rounded-[14px] bg-[#5B3FD6] text-white text-sm font-black disabled:opacity-40"
              >
                اعتماد {workspace.task.sourceUrls.length || ''} مراجع مختارة
              </button>
            </div>
          )}
        </div>
      )}

      {generated.length > 0 && (
        <div className="bg-white dark:bg-[#211D2C] rounded-[20px] border border-[#DDD5FF] dark:border-[#493B66] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-sm">معاينة البنك</h3>
              <p className="text-[10px] text-gray-400 dark:text-[#A39AAD] mt-1">{generated.length} سؤال • من الروابط التي اخترتها فقط</p>
            </div>
            <button onClick={saveBank} className="h-10 px-4 rounded-[12px] bg-[#16864B] text-white text-[11px] font-bold">حفظ البنك</button>
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto flex flex-col gap-2">
            {generated.map((q, i) => (
              <div key={i} className="rounded-[12px] bg-[#F8F9FD] dark:bg-[#191621] p-3">
                <div className="text-[10px] font-bold text-[#6E50DD] dark:text-[#BBAAFF]">سؤال {i + 1}</div>
                <div className="text-xs font-bold mt-1 leading-5">{q.question}</div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-2">✓ {q.correctAnswer}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {status && !busy && !sourceBusy && (
        <div className="rounded-[12px] bg-[#F5F3FF] dark:bg-[#302844] text-[#5B3FD6] dark:text-[#C8BAFF] px-3 py-2.5 text-[11px] leading-5">{status}</div>
      )}

      <div className="fixed bottom-[72px] left-0 right-0 z-30 px-3 pointer-events-none">
        <div className="max-w-md sm:max-w-2xl mx-auto pointer-events-auto">
          <div className="rounded-[22px] bg-white dark:bg-[#211D2C] border border-[#DCD5EC] dark:border-[#4A4057] shadow-2xl p-2.5">
            {localSources.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 mb-1">
                {localSources.map((source) => {
                  const isImage = source.kind === 'inline' && Boolean(source.mimeType?.startsWith('image/')) && Boolean(source.base64);
                  const isPdf = source.kind === 'inline' && source.mimeType === 'application/pdf';
                  return (
                    <div key={source.id} className="relative shrink-0">
                      {isImage ? (
                        <div className="w-16 h-16 rounded-[14px] overflow-hidden border border-gray-100 dark:border-[#40384D] bg-[#F8F9FD] dark:bg-[#191621]">
                          <img
                            src={`data:${source.mimeType};base64,${source.base64}`}
                            alt={source.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="h-16 max-w-[190px] rounded-[14px] border border-gray-100 dark:border-[#40384D] bg-[#F8F9FD] dark:bg-[#191621] px-3 flex items-center gap-2">
                          <div className="w-9 h-9 rounded-[10px] bg-[#F0ECFF] dark:bg-[#302844] text-[#5B3FD6] dark:text-[#C8BAFF] flex items-center justify-center shrink-0">
                            {isPdf ? <FileText className="w-4.5 h-4.5" /> : source.title.startsWith('بنك:') ? <Database className="w-4.5 h-4.5" /> : <FileText className="w-4.5 h-4.5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold truncate">{source.title}</div>
                            <div className="text-[9px] text-gray-400 dark:text-[#9D95AC] mt-0.5">
                              {isPdf ? 'PDF' : source.title.startsWith('بنك:') ? 'بنك أسئلة' : source.title.startsWith('مرجع:') ? 'مرجع' : 'ملف'}
                            </div>
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => removeLocalSource(source.id)}
                        className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-[#2C2145] dark:bg-white text-white dark:text-[#2C2145] flex items-center justify-center shadow"
                        aria-label="إزالة المرفق"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-end gap-2">
              <AiSourcePicker
                disabled={busy || sourceBusy}
                attachmentCount={localSources.length}
                maxAttachments={8}
                onAdd={addLocalSource}
                onSearchWeb={() => {
                  if (workspace.task.topic) void searchSources();
                  else setStatus('حدد الموضوع أولًا حتى يقترح Gemini مصادر ويب مناسبة.');
                }}
                onStatus={setStatus}
              />

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
                className="flex-1 max-h-28 resize-none bg-transparent border-0 px-2 py-3 text-sm text-[#2C2145] dark:text-white placeholder:text-gray-400 outline-none"
              />

              <button
                onClick={() => void send()}
                disabled={busy || (!message.trim() && localSources.length === 0 && workspace.task.sourceUrls.length === 0)}
                className="w-11 h-11 rounded-[14px] bg-[#5B3FD6] text-white flex items-center justify-center disabled:opacity-40 shrink-0"
              >
                {busy ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 rotate-180" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
