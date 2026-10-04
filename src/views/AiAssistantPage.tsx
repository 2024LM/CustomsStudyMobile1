import React, { useEffect, useRef, useState } from 'react';
import {
import { FloatingNotice } from '../components/FloatingNotice';
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '../services/db';
import {
  activeAiSessionId,
  addAiMessage,
  AiChatMessage,
  AiRichContentBlock,
  AiSessionSummary,
  AiWorkspaceState,
  aiSessionSummaries,
  createAiSession,
  deleteAiSession,
  loadAiWorkspace,
  saveAiWorkspace,
  switchAiSession,
} from '../services/aiOrchestrator';
import {
  aiReady,
  generateBankFromMixedSources,
  generateRichWebResponse,
  GeneratedBankQuestion,
  MixedAiSource,
  respondToStudyChat,
  runStudyAssistant,
  searchWebReferences,
  WebReferenceCandidate,
} from '../services/geminiAi';
import { ExcelPreview } from '../types';
import { AiSourcePicker } from '../components/AiSourcePicker';
import { SpeakButton } from '../components/SpeakButton';

interface AiAssistantPageProps {
  initialMessage?:string;
  onConsumeInitial?:()=>void;
  onOpenSettings: () => void;
}

function sourceDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function youtubeEmbedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let id = '';
    if (parsed.hostname.includes('youtu.be')) {
      id = parsed.pathname.replace(/^\//, '').split('/')[0] || '';
    } else if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') id = parsed.searchParams.get('v') || '';
      if (!id) {
        const parts = parsed.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex((part) => ['shorts', 'embed', 'live'].includes(part));
        if (marker >= 0) id = parts[marker + 1] || '';
      }
    }
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0` : '';
  } catch {
    return '';
  }
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

type LocalCommandRoute =
  | { kind: 'rich'; webKinds: Array<'youtube' | 'images' | 'links'> }
  | { kind: 'progress' }
  | { kind: 'chat' }
  | { kind: 'planner' };

function normalizeCommandText(value: string): string {
  return value
    .toLocaleLowerCase('ar')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function localCommandRoute(
  text: string,
  hasAttachments: boolean,
  task: AiWorkspaceState['task']
): LocalCommandRoute {
  const normalized = normalizeCommandText(text);
  const bankSignal = /(بنك|بنوك|qcm|اسئل|سؤال.*اختيار|اختيار متعدد)/i.test(normalized);
  const referenceBuildSignal = /(انش.*مرجع|مرجع دراسي|مراجع.*بناء|مصادر.*بناء)/i.test(normalized);
  const activeWorkflow = ['bank', 'references'].includes(task.kind)
    && !['idle', 'done', 'error'].includes(task.status);

  const webKinds: Array<'youtube' | 'images' | 'links'> = [];
  if (/(youtube|يوتيوب|فيديوهات?|فيديو\b|دروس? مرئي)/i.test(normalized)) webKinds.push('youtube');
  if (/(images?|صور|صوره)/i.test(normalized)) webKinds.push('images');
  if (/(links?|روابط|رابط|مواقع مفيده|مواقع موثوقه)/i.test(normalized)) webKinds.push('links');

  // طلب الوسائط المستقل لا يحتاج Planner. إذا كان الطلب صريحًا لبناء بنك/مرجع
  // نتركه للمخطط حتى يحافظ على دورة اختيار المصادر.
  if (webKinds.length && !bankSignal && !referenceBuildSignal) {
    return { kind: 'rich', webKinds: Array.from(new Set(webKinds)) };
  }

  if (
    !hasAttachments &&
    !bankSignal &&
    !referenceBuildSignal &&
    /(تقدمي|تقدم|احصائيات|نتائجي|نسبه نجاح|نقاط ضعفي|مستواي|ادائي|مراجعتي اليوم)/i.test(normalized)
  ) {
    return { kind: 'progress' };
  }

  if (
    bankSignal ||
    referenceBuildSignal ||
    (activeWorkflow && /(اكمل|اعتمد|مصادر|مراجع|انش|ولد|حفظ|احفظ|اضف|اختار|اختر)/i.test(normalized))
  ) {
    return { kind: 'planner' };
  }

  // المحادثة العادية وتحليل المرفقات يذهبان مباشرة إلى Gemini دون طلب Planner إضافي.
  return { kind: 'chat' };
}

function localProgressReply(analytics: ReturnType<typeof db.dashboardAnalytics>): string {
  const stats = analytics.stats;
  const weak = (analytics.weakTopics || [])
    .slice(0, 3)
    .map((item: any) => item?.topic || item?.name || item?.label)
    .filter(Boolean);
  const strong = (analytics.strongTopics || [])
    .slice(0, 3)
    .map((item: any) => item?.topic || item?.name || item?.label)
    .filter(Boolean);

  const lines = [
    `أجبت عن ${stats.answered} سؤالًا: ${stats.correct} صحيحة و${stats.wrong} خاطئة.`,
    `نسبة النجاح الحالية: ${stats.successRate}%، والمراجعات المستحقة: ${analytics.dueReview}، والأسئلة غير المجابة: ${analytics.unseen}.`,
  ];
  if (weak.length) lines.push(`أكثر المحاور التي تحتاج مراجعة: ${weak.join('، ')}.`);
  if (strong.length) lines.push(`أقوى المحاور حاليًا: ${strong.join('، ')}.`);
  return lines.join('\n');
}

function copyableMessageText(message: AiChatMessage): string {
  const parts: string[] = [];
  if (message.text.trim()) parts.push(message.text.trim());

  for (const block of message.blocks || []) {
    if (block.beforeText) parts.push(block.beforeText);
    if (block.title) parts.push(block.title);
    for (const item of block.items) {
      parts.push([item.title, item.subtitle, item.url].filter(Boolean).join(' — '));
    }
    if (block.afterText) parts.push(block.afterText);
  }

  return parts.join('\n\n').trim();
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

export const AiAssistantPage: React.FC<AiAssistantPageProps> = ({ onOpenSettings,initialMessage,onConsumeInitial }) => {
  const [workspace, setWorkspace] = useState<AiWorkspaceState>(() => loadAiWorkspace());
  const [sessions, setSessions] = useState<AiSessionSummary[]>(() => aiSessionSummaries());
  const [activeSessionId, setActiveSessionId] = useState(() => activeAiSessionId());
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [manualSourceOpen, setManualSourceOpen] = useState(false);
  const [manualSourceUrl, setManualSourceUrl] = useState('');
  const [manualSourceTitle, setManualSourceTitle] = useState('');
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
  const [playingYoutubeId, setPlayingYoutubeId] = useState<string | null>(null);
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
    setSessions(aiSessionSummaries());
    setActiveSessionId(activeAiSessionId());
  }, [workspace.messages.length, workspace.task.updatedAt, busy]);

  useEffect(()=>{if(initialMessage){setMessage(initialMessage.slice(0,3000));onConsumeInitial?.();}},[initialMessage]);

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

  const addManualWebSource = () => {
    const rawUrl = manualSourceUrl.trim();
    let normalizedUrl = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      normalizedUrl = parsed.toString();
    } catch {
      setStatus('أدخل رابط مصدر صالحًا يبدأ بـ http:// أو https://');
      return;
    }

    if (workspace.task.sourceUrls.length >= 5 && !workspace.task.sourceUrls.includes(normalizedUrl)) {
      setStatus('يمكن اعتماد 5 روابط ويب كحد أقصى.');
      return;
    }

    const title = manualSourceTitle.trim().slice(0, 180) || sourceDomain(normalizedUrl);
    const item: WebReferenceCandidate = {
      url: normalizedUrl,
      title,
      domain: sourceDomain(normalizedUrl),
      note: 'مصدر أضافه المستخدم يدويًا',
    };

    setCandidates((current) => {
      const withoutDuplicate = current.filter((candidate) => candidate.url !== normalizedUrl);
      return [item, ...withoutDuplicate];
    });

    const existingUrls = workspace.task.sourceUrls;
    const nextUrls = existingUrls.includes(normalizedUrl)
      ? existingUrls
      : [...existingUrls, normalizedUrl].slice(0, 5);
    const nextTitles = nextUrls.map((url) =>
      url === normalizedUrl
        ? title
        : workspace.task.sourceTitles[existingUrls.indexOf(url)] || sourceDomain(url)
    );

    updateWorkspace({
      ...workspace,
      task: {
        ...workspace.task,
        sourceIds: [],
        sourceUrls: nextUrls,
        sourceTitles: nextTitles,
        status: 'collecting',
        updatedAt: Date.now(),
      },
    });

    setManualSourceUrl('');
    setManualSourceTitle('');
    setManualSourceOpen(false);
    setStatus('تمت إضافة المصدر واختياره.');
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
      setCandidates([]);
      setManualSourceOpen(true);
      setStatus((error?.message || 'تعذر البحث عن المراجع.') + ' يمكنك إضافة مصدر يدويًا من الأسفل.');
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
    kinds: Array<'youtube' | 'images' | 'links'>,
    query: string,
    baseState: AiWorkspaceState
  ) => {
    const uniqueKinds = Array.from(new Set(kinds));
    const labels = uniqueKinds.map((kind) =>
      kind === 'youtube' ? 'فيديوهات YouTube' : kind === 'images' ? 'صور' : 'روابط'
    );
    setStatus(`Gemini يبحث ويُعد ${labels.join(' و')}…`);

    const rich = await generateRichWebResponse(query, uniqueKinds);
    const blocks: AiRichContentBlock[] = rich.blocks.map((block, blockIndex) => ({
      type: 'rich_content',
      title: block.title,
      beforeText: block.beforeText,
      afterText: block.afterText,
      items: block.items.map((item, itemIndex) => ({
        id: `${block.type}_${Date.now().toString(36)}_${blockIndex}_${itemIndex}`,
        type: block.type,
        title: item.title,
        url: item.url,
        subtitle: item.description,
        thumbnailUrl: item.thumbnailUrl,
      })),
    }));

    const next = addAiMessage(
      baseState,
      'assistant',
      rich.reply || 'هذه النتائج التي أعدها Gemini لطلبك.',
      [],
      blocks
    );
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
      const activeSources: MixedAiSource[] = [
        ...state.task.sourceUrls.map((url, index) => ({
          id: 'web_chat_' + index,
          title: state.task.sourceTitles[index] || sourceDomain(url),
          kind: 'url' as const,
          url,
        })),
        ...nextTaskLocalSources,
      ];

      const assistantContext = {
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
      };

      const route = localCommandRoute(userText, activeSources.length > 0, state.task);

      if (route.kind === 'rich') {
        const freshState: AiWorkspaceState = {
          ...state,
          task: freshChatTask(state.task),
        };
        setWorkspace(freshState);
        setCandidates([]);
        setShowSources(false);
        setGenerated([]);
        setTaskLocalSources([]);
        await runRichSearch(route.webKinds, userText, freshState);
        return;
      }

      if (route.kind === 'progress') {
        const next = addAiMessage(state, 'assistant', localProgressReply(analytics));
        setWorkspace(next);
        setStatus('');
        return;
      }

      if (route.kind === 'chat') {
        setStatus(activeSources.length ? 'Gemini يحلل الطلب والمرفقات…' : 'Gemini يجيب مباشرة…');
        const reply = await respondToStudyChat(assistantContext, activeSources);
        const next = addAiMessage(
          { ...state, task: freshChatTask(state.task) },
          'assistant',
          reply || 'لم يُرجع Gemini نصًا قابلًا للعرض.'
        );
        setWorkspace(next);
        setStatus('');
        return;
      }

      // Planner محجوز للمهام المركبة: إنشاء بنك/مرجع، استكمال المصادر، أو توليد الناتج.
      const decision = await runStudyAssistant(assistantContext, activeSources);

      if (decision.action === 'web_content') {
        const freshState: AiWorkspaceState = {
          ...state,
          task: freshChatTask(state.task),
        };
        setWorkspace(freshState);
        setCandidates([]);
        setShowSources(false);
        setGenerated([]);
        setTaskLocalSources([]);
        await runRichSearch(
          decision.webKinds?.length ? decision.webKinds : ['links'],
          userText,
          freshState
        );
        return;
      }

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

      if (decision.action === 'source_picker' || decision.sourcePicker) {
        const searchTopic = (decision.topic || nextTask.topic || userText).trim();
        await searchSources(searchTopic, state);
        return;
      }

      if (
        (decision.action === 'generate_bank' || decision.shouldGenerateBank) &&
        (nextTask.sourceUrls.length > 0 || nextTaskLocalSources.length > 0)
      ) {
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

  const clearTransientSessionState = () => {
    setCandidates([]);
    setGenerated([]);
    setLocalSources([]);
    setTaskLocalSources([]);
    setSentAttachmentPayloads({});
    setPlayingYoutubeId(null);
    setStatus('');
    setShowSources(false);
    setManualSourceOpen(false);
    setManualSourceUrl('');
    setManualSourceTitle('');
  };

  const startNewSession = () => {
    const next = createAiSession();
    setWorkspace(next);
    setSessions(aiSessionSummaries());
    setActiveSessionId(activeAiSessionId());
    clearTransientSessionState();
    setSessionsOpen(false);
  };

  const openSession = (id: string) => {
    if (id === activeSessionId) {
      setSessionsOpen(false);
      return;
    }
    const next = switchAiSession(id);
    setWorkspace(next);
    setSessions(aiSessionSummaries());
    setActiveSessionId(id);
    clearTransientSessionState();
    setSessionsOpen(false);
  };

  const removeSession = (id: string) => {
    if (!window.confirm('حذف هذه الجلسة المحفوظة؟')) return;
    const next = deleteAiSession(id);
    setWorkspace(next);
    setSessions(aiSessionSummaries());
    setActiveSessionId(activeAiSessionId());
    clearTransientSessionState();
  };

  const copyMessage = async (item: AiChatMessage) => {
    const text = copyableMessageText(item);
    if (!text) return;
    try {
      await copyToClipboard(text);
      setCopiedMessageId(item.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === item.id ? null : current), 1600);
    } catch {
      setStatus('تعذر نسخ الرسالة على هذا الجهاز.');
    }
  };

  const clearWorkspace = () => {
    if (!window.confirm('بدء جلسة جديدة؟ ستبقى هذه الجلسة محفوظة في القائمة.')) return;
    startNewSession();
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
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></div>
            <div className="min-w-0">
              <h1 className="font-black text-base sm:text-lg leading-tight">مساعد الدراسة AI</h1>
              <p className="text-[10px] sm:text-xs text-[#E4DEFF] mt-0.5 leading-4">التطبيق يدير الخطة • Gemini ينفذ الخطوة الحالية</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSessionsOpen(true)}
              className="w-10 h-10 rounded-[12px] bg-white/15 flex items-center justify-center"
              aria-label="الجلسات"
              title="الجلسات المحفوظة"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>
            <button onClick={clearWorkspace} className="w-10 h-10 rounded-[12px] bg-white/15 flex items-center justify-center" aria-label="جلسة جديدة">
              <Plus className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </div>

      {sessionsOpen && (
        <div className="fixed inset-0 z-[80]">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
            onClick={() => setSessionsOpen(false)}
            aria-label="إغلاق الجلسات"
          />
          <aside className="absolute top-0 right-0 h-full w-[86%] max-w-sm bg-white dark:bg-[#191621] shadow-2xl flex flex-col text-right">
            <div className="px-4 pt-5 pb-4 border-b border-gray-100 dark:border-[#332D3D]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-base text-[#2C2145] dark:text-white">جلسات AI</h2>
                  <p className="text-[10px] text-gray-400 mt-1">تُحفظ تلقائيًا ويُحدد العنوان من أول رسالة</p>
                </div>
                <button onClick={() => setSessionsOpen(false)} className="w-9 h-9 rounded-[11px] bg-[#F8F9FD] dark:bg-[#292435] flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={startNewSession}
                className="mt-4 w-full h-11 rounded-[13px] bg-[#5B3FD6] text-white text-xs font-black flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                جلسة جديدة
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`rounded-[14px] border transition-all ${session.active ? 'border-[#6E50DD] bg-[#F5F3FF] dark:bg-[#302844]' : 'border-gray-100 dark:border-[#373043] bg-white dark:bg-[#211D2C]'}`}
                >
                  <div className="flex items-center gap-2 p-2">
                    <button
                      type="button"
                      onClick={() => openSession(session.id)}
                      className="min-w-0 flex-1 text-right px-1 py-1"
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className={`w-4 h-4 shrink-0 ${session.active ? 'text-[#5B3FD6]' : 'text-gray-400'}`} />
                        <span className="text-[11px] font-bold truncate text-[#2C2145] dark:text-white">{session.title}</span>
                      </div>
                      <div className="text-[9px] text-gray-400 mt-1 pr-6">
                        {session.messageCount} رسالة • {new Date(session.updatedAt).toLocaleDateString('ar-MA')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSession(session.id)}
                      className="w-8 h-8 rounded-[9px] text-gray-400 hover:bg-red-50 hover:text-red-600 flex items-center justify-center shrink-0"
                      aria-label="حذف الجلسة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

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

      <div className="flex flex-col gap-10 min-h-[260px]">
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
            <div data-speech-scope key={item.id} className={`group relative max-w-[88%] rounded-[17px] px-3.5 py-3 text-xs leading-6 ${item.role === 'user' ? 'self-start bg-[#5B3FD6] text-white rounded-tr-[5px]' : 'self-end bg-white dark:bg-[#211D2C] border border-gray-100 dark:border-[#373043] text-[#3D3550] dark:text-[#E7E1EF] rounded-tl-[5px]'}`}>
              <div className={`absolute -bottom-8 ${item.role === 'user' ? 'right-1' : 'left-1'} flex items-center gap-1`}>
                <button
                  type="button"
                  onClick={() => void copyMessage(item)}
                  className={`h-7 px-2 rounded-[9px] flex items-center gap-1 text-[9px] font-bold opacity-70 hover:opacity-100 ${item.role === 'user' ? 'bg-[#4B31C7] text-white' : 'bg-white dark:bg-[#292435] border border-gray-100 dark:border-[#3A3348] text-gray-500 dark:text-[#C9C1D3]'}`}
                  aria-label="نسخ الرسالة"
                  title="نسخ الرسالة"
                >
                  {copiedMessageId === item.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedMessageId === item.id ? 'تم' : 'نسخ'}
                </button>
                <SpeakButton
                  text={copyableMessageText(item)}
                  title="قراءة الرسالة"
                  className={`!w-7 !h-7 opacity-70 hover:opacity-100 ${item.role === 'user' ? 'bg-[#4B31C7] text-white' : 'bg-white dark:bg-[#292435] border border-gray-100 dark:border-[#3A3348]'}`}
                  onError={setStatus}
                />
              </div>
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
                  {block.beforeText && (
                    <div className={`text-[10px] leading-5 mb-2 ${item.role === 'user' ? 'text-white/85' : 'text-[#5B5367] dark:text-[#C9C1D3]'}`}>
                      {block.beforeText}
                    </div>
                  )}
                  <div className={`text-[10px] font-black mb-2 ${item.role === 'user' ? 'text-white/85' : 'text-[#5B3FD6] dark:text-[#C8BAFF]'}`}>
                    {block.title}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                    {block.items.map((richItem, index) => (
                      richItem.type === 'youtube' ? (
                        <div
                          key={richItem.id}
                          className="w-64 shrink-0 snap-start rounded-[14px] overflow-hidden bg-white dark:bg-[#191621] border border-gray-100 dark:border-[#3A3348] text-[#2C2145] dark:text-white"
                        >
                          <div className="relative aspect-video bg-gray-100 dark:bg-[#111] overflow-hidden">
                            {playingYoutubeId === richItem.id && youtubeEmbedUrl(richItem.url) ? (
                              <iframe
                                src={youtubeEmbedUrl(richItem.url)}
                                title={richItem.title}
                                className="w-full h-full border-0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPlayingYoutubeId(richItem.id)}
                                className="relative w-full h-full"
                                aria-label="تشغيل الفيديو داخل التطبيق"
                              >
                                {richItem.thumbnailUrl ? (
                                  <img src={richItem.thumbnailUrl} alt={richItem.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"><Globe2 className="w-6 h-6 text-gray-400" /></div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-11 h-11 rounded-full bg-black/75 text-white flex items-center justify-center shadow-lg">
                                    <span className="text-base pr-0.5">▶</span>
                                  </div>
                                </div>
                                <div className="absolute top-2 right-2 h-6 px-2 rounded-full bg-red-600 text-white flex items-center justify-center text-[9px] font-black">YouTube</div>
                              </button>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="text-[11px] font-bold leading-5 line-clamp-2">{index + 1}. {richItem.title}</div>
                            {richItem.subtitle && <div className="text-[9px] text-gray-400 mt-1 truncate">{richItem.subtitle}</div>}
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => setPlayingYoutubeId(playingYoutubeId === richItem.id ? null : richItem.id)}
                                className="flex-1 h-8 rounded-[9px] bg-[#F5F3FF] dark:bg-[#302844] text-[#5B3FD6] dark:text-[#C8BAFF] text-[9px] font-bold"
                              >
                                {playingYoutubeId === richItem.id ? 'إغلاق المشغل' : 'تشغيل هنا'}
                              </button>
                              <a
                                href={richItem.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-8 px-3 rounded-[9px] border border-gray-100 dark:border-[#3A3348] text-[9px] font-bold flex items-center justify-center gap-1 no-underline text-[#5B3FD6] dark:text-[#C8BAFF]"
                              >
                                <ExternalLink className="w-3 h-3" />
                                YouTube
                              </a>
                            </div>
                          </div>
                        </div>
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
                  {block.afterText && (
                    <div className={`text-[10px] leading-5 mt-2 ${item.role === 'user' ? 'text-white/85' : 'text-[#5B5367] dark:text-[#C9C1D3]'}`}>
                      {block.afterText}
                    </div>
                  )}
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
              <div className="py-7 text-center text-xs text-gray-400">
                لم تظهر مصادر من المزود. يمكنك إضافة مصدر بنفسك من الأسفل.
              </div>
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

          <div className="p-3 border-t border-[#EEEAF8] dark:border-[#352D43]">
            {!manualSourceOpen ? (
              <button
                type="button"
                onClick={() => setManualSourceOpen(true)}
                className="w-full h-11 rounded-[13px] border border-[#D9D1EF] dark:border-[#4A4057] text-[#5B3FD6] dark:text-[#C8BAFF] text-xs font-black flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                إضافة مصدر
              </button>
            ) : (
              <div className="rounded-[14px] bg-[#F8F9FD] dark:bg-[#191621] p-3 flex flex-col gap-2">
                <div className="text-xs font-black">إضافة مصدر يدويًا</div>
                <input
                  value={manualSourceUrl}
                  onChange={(e) => setManualSourceUrl(e.target.value.slice(0, 2000))}
                  placeholder="https://example.com/source"
                  inputMode="url"
                  dir="ltr"
                  className="w-full h-11 rounded-[11px] border border-gray-200 dark:border-[#40384D] bg-white dark:bg-[#211D2C] px-3 text-xs outline-none focus:border-[#6E50DD]"
                />
                <input
                  value={manualSourceTitle}
                  onChange={(e) => setManualSourceTitle(e.target.value.slice(0, 180))}
                  placeholder="اسم المصدر — اختياري"
                  className="w-full h-11 rounded-[11px] border border-gray-200 dark:border-[#40384D] bg-white dark:bg-[#211D2C] px-3 text-xs outline-none focus:border-[#6E50DD]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addManualWebSource}
                    disabled={!manualSourceUrl.trim()}
                    className="flex-1 h-10 rounded-[11px] bg-[#5B3FD6] text-white text-xs font-black disabled:opacity-40"
                  >
                    إضافة واختيار المصدر
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualSourceOpen(false);
                      setManualSourceUrl('');
                      setManualSourceTitle('');
                    }}
                    className="h-10 px-4 rounded-[11px] bg-white dark:bg-[#292435] border border-gray-200 dark:border-[#40384D] text-xs font-bold"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>

          {candidates.length > 0 && (
            <div className="p-3 border-t border-[#EEEAF8] dark:border-[#352D43]">
              <button
                onClick={() => void acceptSources()}
                disabled={(workspace.task.sourceUrls.length === 0 && taskLocalSources.length === 0 && localSources.length === 0) || busy}
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

      <FloatingNotice message={status} onDismiss={() => setStatus('')} />

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

            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
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
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                placeholder="اكتب طلبك للمساعد…"
                className="flex-1 max-h-28 resize-none bg-transparent border-0 px-2 py-3 text-sm text-[#2C2145] dark:text-white placeholder:text-gray-400 outline-none"
              />

              <button
                type="submit"
                disabled={busy || sourceBusy || (!message.trim() && localSources.length === 0)}
                className="w-11 h-11 rounded-[14px] bg-[#5B3FD6] text-white flex items-center justify-center disabled:opacity-40 shrink-0 active:scale-95 transition-transform"
                aria-label="إرسال الرسالة"
                title="إرسال"
              >
                {busy ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
