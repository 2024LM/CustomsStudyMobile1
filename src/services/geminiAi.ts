import { Capacitor, registerPlugin } from '@capacitor/core';
import { QuizQuestion } from '../types';

export type GeminiModel = 'gemini-3.6-flash' | 'gemini-3.5-flash-lite' | 'gemini-3.1-pro';

const ENABLED_KEY = 'ai_gemini_enabled';
const VERIFIED_KEY = 'ai_gemini_verified';
const MODEL_KEY = 'ai_gemini_model';
const WEB_KEY = 'ai_gemini_web_key';

interface SecureSecretsPlugin {
  setGeminiKey(options: { value: string }): Promise<void>;
  getGeminiKey(): Promise<{ value: string }>;
  deleteGeminiKey(): Promise<void>;
}

const SecureSecrets = registerPlugin<SecureSecretsPlugin>('NexusSecureSecrets');

export const GEMINI_MODELS: Array<{ id: GeminiModel; label: string; description: string }> = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', description: 'متوازن وسريع للاستخدام اليومي' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', description: 'أخف وأقل استهلاكًا للمهام البسيطة' },
  { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', description: 'للمهام الأكثر تعقيدًا' },
];

export function aiEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === '1';
}

export function setAiEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
}

export function aiVerified(): boolean {
  return localStorage.getItem(VERIFIED_KEY) === '1';
}

export function setAiVerified(verified: boolean): void {
  localStorage.setItem(VERIFIED_KEY, verified ? '1' : '0');
}

export function geminiModel(): GeminiModel {
  const value = localStorage.getItem(MODEL_KEY) as GeminiModel | null;
  return GEMINI_MODELS.some((item) => item.id === value) ? value! : 'gemini-3.6-flash';
}

export function setGeminiModel(model: GeminiModel): void {
  localStorage.setItem(MODEL_KEY, model);
  setAiVerified(false);
}

export async function saveGeminiKey(value: string): Promise<void> {
  const clean = value.trim();
  if (!clean) throw new Error('أدخل مفتاح Gemini API أولًا.');
  if (Capacitor.getPlatform() === 'android') {
    await SecureSecrets.setGeminiKey({ value: clean });
  } else {
    localStorage.setItem(WEB_KEY, clean);
  }
  setAiVerified(false);
}

export async function getGeminiKey(): Promise<string> {
  try {
    if (Capacitor.getPlatform() === 'android') {
      return (await SecureSecrets.getGeminiKey()).value || '';
    }
    return localStorage.getItem(WEB_KEY) || '';
  } catch {
    return '';
  }
}

export async function deleteGeminiKey(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    try { await SecureSecrets.deleteGeminiKey(); } catch {}
  } else {
    localStorage.removeItem(WEB_KEY);
  }
  setAiVerified(false);
  setAiEnabled(false);
}

function responseText(payload: any): string {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .join('\n')
    .trim();
  if (!text) {
    const reason = payload?.promptFeedback?.blockReason || payload?.candidates?.[0]?.finishReason;
    if (reason) throw new Error(`لم يُرجع Gemini نصًا. السبب: ${reason}`);
    throw new Error('لم يُرجع Gemini استجابة نصية.');
  }
  return text;
}

async function generate(prompt: string, maxOutputTokens = 700): Promise<string> {
  const key = await getGeminiKey();
  if (!key) throw new Error('لم يتم حفظ مفتاح Gemini API.');
  const model = geminiModel();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens,
        },
      }),
    }
  );

  let payload: any = null;
  try { payload = await response.json(); } catch {}

  if (!response.ok) {
    const apiMessage = payload?.error?.message || '';
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error(apiMessage || 'مفتاح Gemini أو إعداداته غير صالحة.');
    }
    if (response.status === 429) throw new Error('تم بلوغ حد الطلبات لدى Gemini. حاول لاحقًا.');
    throw new Error(apiMessage || 'تعذر الاتصال بخدمة Gemini.');
  }

  return responseText(payload);
}

export async function verifyGeminiConnection(): Promise<void> {
  await generate('أجب بكلمة واحدة فقط: متصل', 20);
  setAiVerified(true);
}

export async function aiReady(): Promise<boolean> {
  if (!aiEnabled() || !aiVerified()) return false;
  return Boolean(await getGeminiKey());
}

function questionContext(question: QuizQuestion, selectedAnswer?: string | null): string {
  return [
    `السؤال: ${question.question}`,
    `الإجابة الصحيحة: ${question.correctAnswer}`,
    question.explanation ? `الشرح الموجود: ${question.explanation}` : '',
    question.topic ? `المحور: ${question.topic}` : '',
    selectedAnswer && selectedAnswer !== '__TIMEOUT__' ? `إجابة المستخدم: ${selectedAnswer}` : '',
  ].filter(Boolean).join('\n');
}

export async function explainQuestion(question: QuizQuestion): Promise<string> {
  return generate(
    `أنت مساعد دراسة عربي. اشرح السؤال التالي بدقة وبأسلوب واضح ومختصر. لا تغيّر الإجابة الصحيحة، وإذا كانت المعلومات غير كافية فاذكر ذلك.\n\n${questionContext(question)}`
  );
}

export async function explainMistake(question: QuizQuestion, selectedAnswer: string | null): Promise<string> {
  return generate(
    `أنت مدرس مراجعة. وضّح بالعربية لماذا كانت إجابة المستخدم غير صحيحة، ثم بيّن الفرق بينها وبين الإجابة الصحيحة بطريقة تعليمية مختصرة. لا تخترع معلومات خارج السياق.\n\n${questionContext(question, selectedAnswer)}`
  );
}

export async function similarQuestion(question: QuizQuestion): Promise<string> {
  return generate(
    `أنشئ سؤال مراجعة جديدًا مشابهًا في المستوى والموضوع للسؤال التالي، لكن لا تكرر صياغته. أخرج: السؤال، الإجابة الصحيحة، ثلاثة خيارات خاطئة، وشرحًا قصيرًا. اكتب بالعربية وبصيغة واضحة.\n\n${questionContext(question)}`,
    900
  );
}


const REFERENCE_CHAR_LIMIT = 24000;

function cleanReferenceText(text: string): string {
  const clean = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  if (!clean) throw new Error('لا يوجد نص قابل للإرسال إلى Gemini في هذا المرجع.');
  return clean.length > REFERENCE_CHAR_LIMIT
    ? clean.slice(0, REFERENCE_CHAR_LIMIT) + '\n\n[تم اقتطاع بقية المرجع لتقليل حجم الطلب]'
    : clean;
}

export async function summarizeReference(title: string, text: string): Promise<string> {
  const source = cleanReferenceText(text);
  return generate(
    `لخّص المرجع التالي بالعربية لأغراض الدراسة. أخرج: ملخصًا مركزًا، أهم النقاط، المصطلحات أو التواريخ المهمة، وما ينبغي حفظه للامتحان. لا تضف حقائق غير موجودة في المرجع.\n\nالعنوان: ${title}\n\nالمحتوى:\n${source}`,
    1400
  );
}

export async function questionsFromReference(title: string, text: string): Promise<string> {
  const source = cleanReferenceText(text);
  return generate(
    `أنشئ 10 أسئلة مراجعة من المرجع التالي فقط. اجعلها مناسبة للاختبارات، وامزج بين QCM وصح/خطأ عندما يكون ذلك منطقيًا. لكل سؤال اكتب: السؤال، الإجابة الصحيحة، ثلاثة خيارات خاطئة عند QCM، وشرحًا قصيرًا. لا تستخدم معلومات من خارج النص.\n\nالعنوان: ${title}\n\nالمحتوى:\n${source}`,
    2200
  );
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
}

export async function flashcardsFromReference(title: string, text: string): Promise<GeneratedFlashcard[]> {
  const source = cleanReferenceText(text);
  const raw = await generate(
    `أنشئ من 6 إلى 12 بطاقة مراجعة من المرجع التالي فقط. أعد JSON صالحًا فقط بدون Markdown وبدون أي شرح خارجي بهذه البنية: [{"front":"سؤال أو مصطلح","back":"جواب واضح ومختصر"}]. لا تضف معلومات غير موجودة في المرجع.\n\nالعنوان: ${title}\n\nالمحتوى:\n${source}`,
    1800
  );

  const cleaned = raw.replace(/^\`\`\`json\s*/i, '').replace(/^\`\`\`\s*/i, '').replace(/\s*\`\`\`$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('أعاد Gemini بطاقات بصيغة غير صالحة. أعد المحاولة.');
  }

  if (!Array.isArray(parsed)) throw new Error('صيغة البطاقات غير صالحة.');
  const cards = parsed
    .map((item: any) => ({
      front: String(item?.front || '').trim().slice(0, 3000),
      back: String(item?.back || '').trim().slice(0, 3000),
    }))
    .filter((item) => item.front && item.back)
    .slice(0, 12);

  if (!cards.length) throw new Error('لم يتم توليد بطاقات صالحة من هذا المرجع.');
  return cards;
}



export interface WebReferenceCandidate {
  title: string;
  url: string;
  domain: string;
  note: string;
}

async function generateWithTools(
  prompt: string,
  tools: Array<Record<string, unknown>>,
  maxOutputTokens = 1400
): Promise<any> {
  const key = await getGeminiKey();
  if (!key) throw new Error('لم يتم حفظ مفتاح Gemini API.');
  const model = geminiModel();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools,
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens,
        },
      }),
    }
  );

  let payload: any = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const apiMessage = payload?.error?.message || '';
    if (response.status === 429) throw new Error('تم بلوغ حد الطلبات لدى Gemini. حاول لاحقًا.');
    throw new Error(apiMessage || 'تعذر استخدام أدوات Gemini.');
  }
  return payload;
}

function safeDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

export async function searchWebReferences(topic: string): Promise<{
  candidates: WebReferenceCandidate[];
  searchHtml: string;
}> {
  const cleanTopic = topic.trim().slice(0, 300);
  if (!cleanTopic) throw new Error('حدد موضوعًا واضحًا قبل البحث عن المراجع.');

  const payload = await generateWithTools(
    `ابحث في الويب عن مصادر موثوقة ومفيدة لطالب يدرس الموضوع التالي: "${cleanTopic}".
أعط أولوية للمصادر الرسمية، المؤسسات التعليمية، القوانين/الوثائق الأصلية، الجامعات، والمنظمات المعروفة.
تجنب الصفحات التجارية الضعيفة والمحتوى المكرر. نحتاج مصادر يمكن استخدامها لبناء بنك أسئلة ومراجعة دراسية.
اكتب في الرد وصفًا موجزًا لأفضل المصادر التي وجدتها، لكن الأهم أن تنفذ بحث Google فعليًا.`,
    [{ google_search: {} }],
    1200
  );

  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const candidates: WebReferenceCandidate[] = [];

  for (const chunk of chunks) {
    const web = chunk?.web;
    const url = String(web?.uri || '').trim();
    if (!/^https:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const title = String(web?.title || safeDomain(url) || 'مرجع ويب').trim();
    candidates.push({
      title: title.slice(0, 180),
      url,
      domain: safeDomain(url),
      note: 'مصدر عثر عليه Gemini عبر Google Search',
    });
    if (candidates.length >= 10) break;
  }

  if (!candidates.length) {
    throw new Error('لم يعثر Gemini على روابط قابلة للاستخدام لهذا الموضوع. جرّب صياغة أكثر تحديدًا.');
  }

  const searchHtml = String(payload?.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent || '');
  return { candidates, searchHtml };
}

export async function generateBankFromUrls(input: {
  bankName: string;
  topic: string;
  count: number;
  urls: string[];
}): Promise<GeneratedBankQuestion[]> {
  const urls = Array.from(new Set(input.urls.filter((url) => /^https:\/\//i.test(url)))).slice(0, 5);
  if (!urls.length) throw new Error('اختر رابطًا واحدًا على الأقل.');

  const rawPayload = await generateWithTools(
    `اقرأ الروابط التالية باستخدام URL Context ثم أنشئ بنك أسئلة QCM عربيًا اعتمادًا حصريًا على محتواها.

اسم البنك: ${input.bankName}
الموضوع: ${input.topic}
العدد المطلوب: ${Math.min(Math.max(input.count, 5), 100)}
الروابط:
${urls.map((url, index) => `${index + 1}. ${url}`).join('\n')}

أعد JSON صالحًا فقط بدون Markdown، وهو مصفوفة عناصر بالشكل:
[{"question":"...","correctAnswer":"...","wrong1":"...","wrong2":"...","wrong3":"...","explanation":"...","topic":"..."}]

الشروط:
- لا تستخدم معلومة غير موجودة في الروابط المختارة.
- كل سؤال له إجابة صحيحة وثلاث إجابات خاطئة مختلفة.
- لا تكرر الأسئلة.
- إذا تعذر الوصول إلى بعض الروابط أو لم تكفِ المادة، أنشئ عددًا أقل بدل الاختراع.
- الشرح قصير ومفيد.`,
    [{ url_context: {} }],
    5200
  );

  const raw = responseText(rawPayload);
  const parsed = parseJsonObject(raw);
  if (!Array.isArray(parsed)) throw new Error('صيغة بنك الأسئلة المولّد غير صالحة.');

  return parsed.map((item: any) => ({
    question: String(item?.question || '').trim().slice(0, 2000),
    correctAnswer: String(item?.correctAnswer || '').trim().slice(0, 2000),
    wrong1: String(item?.wrong1 || '').trim().slice(0, 2000),
    wrong2: String(item?.wrong2 || '').trim().slice(0, 2000),
    wrong3: String(item?.wrong3 || '').trim().slice(0, 2000),
    explanation: String(item?.explanation || '').trim().slice(0, 2000),
    topic: String(item?.topic || input.topic).trim().slice(0, 200),
  })).filter((item: GeneratedBankQuestion) => {
    const values = [item.correctAnswer, item.wrong1, item.wrong2, item.wrong3];
    return item.question.length >= 3 && values.every(Boolean)
      && new Set(values.map((value) => value.toLocaleLowerCase('ar'))).size === 4;
  }).slice(0, Math.min(Math.max(input.count, 5), 100));
}

export interface StudyAssistantContext {
  message: string;
  task: {
    kind: string;
    status: string;
    bankName: string;
    topic: string;
    sourceUrls: string[];
    expectedQuestions: number;
  };
  app: {
    activeDomain: string;
    activeBank: string;
    banks: Array<{ id: string; name: string; questions: number }>;
    stats: {
      answered: number;
      correct: number;
      wrong: number;
      successRate: number;
      dueReview: number;
      unseen: number;
      weakTopics: Array<{ topic: string; successRate: number; wrong: number; attempts: number }>;
      strongTopics: Array<{ topic: string; successRate: number; attempts: number }>;
    };
    references: Array<{ id: string; title: string; description: string; url: string; type: string }>;
  };
  recentMessages: Array<{ role: string; text: string }>;
}

export interface StudyAssistantDecision {
  reply: string;
  intent: 'chat' | 'progress' | 'bank' | 'topic' | 'references';
  taskStatus: 'idle' | 'collecting' | 'ready' | 'review' | 'done';
  bankName?: string;
  topic?: string;
  expectedQuestions?: number;
  requestSources?: boolean;
  requestConfirmation?: boolean;
  shouldGenerateBank?: boolean;
}

function parseJsonObject(raw: string): any {
  const cleaned = raw
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/^\`\`\`\s*/i, '')
    .replace(/\s*\`\`\`$/i, '')
    .trim();
  try { return JSON.parse(cleaned); }
  catch { throw new Error('تعذر فهم استجابة المساعد. أعد المحاولة.'); }
}

export async function runStudyAssistant(context: StudyAssistantContext): Promise<StudyAssistantDecision> {
  const raw = await generate(
    `أنت عقل مساعد دراسة داخل تطبيق، لكن التطبيق نفسه يدير الذاكرة والتنفيذ. لا تفترض أنك تتذكر أي شيء خارج JSON المرسل لك الآن.

قواعدك:
1) أجب بالعربية وباختصار عملي.
2) لا تدّعي تنفيذ شيء. أنت تقترح القرار فقط، والتطبيق ينفذ.
3) عند طلب إنشاء بنك أسئلة: لا تطلب من التطبيق التوليد قبل توفر اسم بنك واضح وموضوع واضح ومصدر واحد على الأقل في sourceUrls. إذا لا توجد مصادر بعد لكن الموضوع واضح، اجعل requestSources=true حتى يبحث التطبيق على الويب ويعرض الروابط للمستخدم.
4) إذا كانت المعلومات ناقصة، اجعل taskStatus="collecting" واشرح بالضبط ما ينقص.
5) إذا كانت جميع معلومات البنك مكتملة والمستخدم طلب المتابعة/الإنشاء، اجعل shouldGenerateBank=true وtaskStatus="ready".
6) تحليل التقدم يعتمد فقط على app.stats ولا تخترع بيانات.
7) إذا طلب المستخدم مراجع أو كان إنشاء البنك يحتاج مصادر، اطلب من التطبيق البحث عن مراجع ويب عبر requestSources=true. لا تخترع روابط بنفسك.
8) لا تغيّر بيانات المستخدم بنفسك ولا تحفظ شيئًا بنفسك.
9) أعد JSON صالحًا فقط بدون Markdown بالشكل:
{"reply":"...","intent":"chat|progress|bank|topic|references","taskStatus":"idle|collecting|ready|review|done","bankName":"","topic":"","expectedQuestions":20,"requestSources":false,"requestConfirmation":false,"shouldGenerateBank":false}

السياق الحالي:
${JSON.stringify(context)}`,
    1000
  );
  const parsed = parseJsonObject(raw);
  return {
    reply: String(parsed.reply || '').trim() || 'تم فهم الطلب.',
    intent: ['chat','progress','bank','topic','references'].includes(parsed.intent) ? parsed.intent : 'chat',
    taskStatus: ['idle','collecting','ready','review','done'].includes(parsed.taskStatus) ? parsed.taskStatus : 'idle',
    bankName: String(parsed.bankName || '').trim().slice(0, 80),
    topic: String(parsed.topic || '').trim().slice(0, 200),
    expectedQuestions: Math.min(Math.max(Number(parsed.expectedQuestions) || 20, 5), 100),
    requestSources: Boolean(parsed.requestSources),
    requestConfirmation: Boolean(parsed.requestConfirmation),
    shouldGenerateBank: Boolean(parsed.shouldGenerateBank),
  };
}

export interface GeneratedBankQuestion {
  question: string;
  correctAnswer: string;
  wrong1: string;
  wrong2: string;
  wrong3: string;
  explanation: string;
  topic: string;
}

export async function generateBankFromSources(input: {
  bankName: string;
  topic: string;
  count: number;
  sources: Array<{ title: string; url: string; text: string }>;
}): Promise<GeneratedBankQuestion[]> {
  const sourceText = input.sources.map((source, index) =>
    `[المصدر ${index + 1}] ${source.title}\nالرابط: ${source.url}\n${cleanReferenceText(source.text)}`
  ).join('\n\n---\n\n');

  const raw = await generate(
    `أنشئ بنك أسئلة QCM عربي اعتمادًا حصريًا على المصادر أدناه.
اسم البنك: ${input.bankName}
الموضوع: ${input.topic}
العدد المطلوب: ${Math.min(Math.max(input.count, 5), 100)}

أعد JSON صالحًا فقط بدون Markdown، وهو مصفوفة عناصر بالشكل:
[{"question":"...","correctAnswer":"...","wrong1":"...","wrong2":"...","wrong3":"...","explanation":"...","topic":"..."}]

الشروط:
- كل سؤال له إجابة صحيحة وثلاث إجابات خاطئة مختلفة.
- لا تستخدم معرفة خارج المصادر.
- لا تكرر الأسئلة.
- إذا لم تكفِ المصادر للعدد المطلوب، أنشئ عددًا أقل بدل الاختراع.
- اكتب شرحًا قصيرًا يوضح سبب صحة الجواب.

المصادر:
${sourceText}`,
    5200
  );

  const parsed = parseJsonObject(raw);
  if (!Array.isArray(parsed)) throw new Error('صيغة بنك الأسئلة المولّد غير صالحة.');
  return parsed.map((item: any) => ({
    question: String(item?.question || '').trim().slice(0, 2000),
    correctAnswer: String(item?.correctAnswer || '').trim().slice(0, 2000),
    wrong1: String(item?.wrong1 || '').trim().slice(0, 2000),
    wrong2: String(item?.wrong2 || '').trim().slice(0, 2000),
    wrong3: String(item?.wrong3 || '').trim().slice(0, 2000),
    explanation: String(item?.explanation || '').trim().slice(0, 2000),
    topic: String(item?.topic || input.topic).trim().slice(0, 200),
  })).filter((item: GeneratedBankQuestion) => {
    const values = [item.correctAnswer, item.wrong1, item.wrong2, item.wrong3];
    return item.question.length >= 3 && values.every(Boolean)
      && new Set(values.map((value) => value.toLocaleLowerCase('ar'))).size === 4;
  }).slice(0, Math.min(Math.max(input.count, 5), 100));
}


export interface MixedAiSource {
  id: string;
  title: string;
  kind: 'text' | 'url' | 'inline';
  text?: string;
  url?: string;
  mimeType?: string;
  base64?: string;
}

export async function generateBankFromMixedSources(input: {
  bankName: string;
  topic: string;
  count: number;
  sources: MixedAiSource[];
}): Promise<GeneratedBankQuestion[]> {
  const sources = input.sources.slice(0, 8);
  if (!sources.length) throw new Error('أضف مصدرًا واحدًا على الأقل قبل إنشاء البنك.');

  const key = await getGeminiKey();
  if (!key) throw new Error('لم يتم حفظ مفتاح Gemini API.');
  const model = geminiModel();

  const parts: any[] = [{
    text: `أنشئ بنك أسئلة QCM عربيًا اعتمادًا حصريًا على المصادر المرفقة في هذا الطلب.

اسم البنك: ${input.bankName}
الموضوع: ${input.topic}
العدد المطلوب: ${Math.min(Math.max(input.count, 5), 100)}

أعد JSON صالحًا فقط بدون Markdown بالشكل:
[{"question":"...","correctAnswer":"...","wrong1":"...","wrong2":"...","wrong3":"...","explanation":"...","topic":"..."}]

الشروط:
- لا تستخدم معرفة خارج المصادر.
- كل سؤال له إجابة صحيحة وثلاث إجابات خاطئة مختلفة.
- لا تكرر الأسئلة.
- إذا كانت المادة غير كافية، أنشئ عددًا أقل بدل الاختراع.
- اكتب شرحًا قصيرًا مفيدًا.
- عند وجود صورة أو PDF استخرج منها فقط ما يمكن قراءته بوضوح.`
  }];

  const urlSources: string[] = [];
  for (const source of sources) {
    if (source.kind === 'text' && source.text?.trim()) {
      parts.push({ text: `\n\n[مصدر: ${source.title}]\n${cleanReferenceText(source.text)}` });
    } else if (source.kind === 'url' && source.url) {
      urlSources.push(source.url);
      parts.push({ text: `\n[رابط مصدر: ${source.title}] ${source.url}` });
    } else if (source.kind === 'inline' && source.base64 && source.mimeType) {
      parts.push({
        inlineData: {
          mimeType: source.mimeType,
          data: source.base64,
        },
      });
      parts.push({ text: `[الملف/الصورة السابقة مصدر بعنوان: ${source.title}]` });
    }
  }

  const body: any = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 5200,
    },
  };
  if (urlSources.length) body.tools = [{ url_context: {} }];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
    }
  );

  let payload: any = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const apiMessage = payload?.error?.message || '';
    if (response.status === 429) throw new Error('تم بلوغ حد الطلبات لدى Gemini. حاول لاحقًا.');
    throw new Error(apiMessage || 'تعذر إنشاء البنك من المصادر المختارة.');
  }

  const raw = responseText(payload);
  const parsed = parseJsonObject(raw);
  if (!Array.isArray(parsed)) throw new Error('صيغة بنك الأسئلة المولّد غير صالحة.');

  return parsed.map((item: any) => ({
    question: String(item?.question || '').trim().slice(0, 2000),
    correctAnswer: String(item?.correctAnswer || '').trim().slice(0, 2000),
    wrong1: String(item?.wrong1 || '').trim().slice(0, 2000),
    wrong2: String(item?.wrong2 || '').trim().slice(0, 2000),
    wrong3: String(item?.wrong3 || '').trim().slice(0, 2000),
    explanation: String(item?.explanation || '').trim().slice(0, 2000),
    topic: String(item?.topic || input.topic).trim().slice(0, 200),
  })).filter((item: GeneratedBankQuestion) => {
    const values = [item.correctAnswer, item.wrong1, item.wrong2, item.wrong3];
    return item.question.length >= 3 && values.every(Boolean)
      && new Set(values.map((value) => value.toLocaleLowerCase('ar'))).size === 4;
  }).slice(0, Math.min(Math.max(input.count, 5), 100));
}
