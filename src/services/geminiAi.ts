import { Capacitor, registerPlugin } from '@capacitor/core';
import { QuizQuestion } from '../types';
import { logAiProviderEvent } from './aiProviderDiagnostics';

export type GeminiModel = 'gemini-3.6-flash' | 'gemini-3.5-flash-lite' | 'gemini-3.1-pro';
export type AiProviderMode = 'auto' | 'api' | 'nano';

const ENABLED_KEY = 'ai_gemini_enabled';
const VERIFIED_KEY = 'ai_gemini_verified';
const MODEL_KEY = 'ai_gemini_model';
const WEB_KEY = 'ai_gemini_web_key';
const PROVIDER_KEY = 'ai_provider_mode';
const KEY_POOL_VERSION = 1;

interface SecureSecretsPlugin {
  setGeminiKey(options: { value: string }): Promise<void>;
  getGeminiKey(): Promise<{ value: string }>;
  deleteGeminiKey(): Promise<void>;
}

const SecureSecrets = registerPlugin<SecureSecretsPlugin>('NexusSecureSecrets');

interface NanoAiPlugin {
  status(): Promise<{
    status: 'available' | 'downloadable' | 'downloading' | 'unavailable';
    available: boolean;
    model?: string;
    tokenLimit?: number;
  }>;
  generate(options: { prompt: string }): Promise<{
    status: 'available' | 'downloadable' | 'downloading' | 'unavailable';
    text: string;
    model?: string;
  }>;
}

const NanoAi = registerPlugin<NanoAiPlugin>('NexusNanoAi');



export function aiProviderMode(): AiProviderMode {
  const value = localStorage.getItem(PROVIDER_KEY) as AiProviderMode | null;
  return value === 'api' || value === 'nano' ? value : 'auto';
}

export function setAiProviderMode(mode: AiProviderMode): void {
  localStorage.setItem(PROVIDER_KEY, mode);
}

export async function nanoStatus(): Promise<{
  status: 'available' | 'downloadable' | 'downloading' | 'unavailable';
  available: boolean;
  model?: string;
  tokenLimit?: number;
}> {
  if (Capacitor.getPlatform() !== 'android') {
    return { status: 'unavailable', available: false };
  }
  try {
    return await NanoAi.status();
  } catch {
    return { status: 'unavailable', available: false };
  }
}

export async function generateWithNano(prompt: string, operation = 'Nano Text'): Promise<string> {
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('Gemini Nano المحلي متاح فقط في نسخة Android.');
  }
  const started = Date.now();
  try {
    const result = await NanoAi.generate({ prompt });
    if (result.status !== 'available') {
      const message = result.status === 'downloadable'
        ? 'Gemini Nano مدعوم على هذا الجهاز لكنه يحتاج تنزيل النموذج أولًا.'
        : result.status === 'downloading'
          ? 'Gemini Nano قيد التنزيل على هذا الجهاز.'
          : 'Gemini Nano غير متاح على هذا الجهاز.';
      logAiProviderEvent({
        provider: 'gemini-nano',
        operation,
        model: result.model,
        status: 'error',
        durationMs: Date.now() - started,
        requestSummary: prompt,
        error: message,
      });
      throw new Error(message);
    }
    if (!result.text.trim()) throw new Error('لم يُرجع Gemini Nano استجابة.');
    logAiProviderEvent({
      provider: 'gemini-nano',
      operation,
      model: result.model,
      status: 'success',
      durationMs: Date.now() - started,
      requestSummary: prompt,
      responseSummary: result.text,
    });
    return result.text.trim();
  } catch (error: any) {
    if (!String(error?.message || '').includes('Gemini Nano')) {
      logAiProviderEvent({
        provider: 'gemini-nano',
        operation,
        status: 'error',
        durationMs: Date.now() - started,
        requestSummary: prompt,
        error: error?.message || 'Gemini Nano inference failed',
      });
    }
    throw error;
  }
}

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

export interface GeminiKeyMeta {
  id: string;
  number: number;
  active: boolean;
  verifiedAt: number;
  masked: string;
}

interface GeminiStoredKey {
  id: string;
  number: number;
  value: string;
  verifiedAt: number;
}

interface GeminiKeyPool {
  version: number;
  activeId: string;
  nextNumber: number;
  keys: GeminiStoredKey[];
}

function emptyKeyPool(): GeminiKeyPool {
  return { version: KEY_POOL_VERSION, activeId: '', nextNumber: 1, keys: [] };
}

function maskGeminiKey(value: string): string {
  if (value.length <= 10) return '••••••••';
  return `${value.slice(0, 5)}••••${value.slice(-4)}`;
}

async function readSecretPayload(): Promise<string> {
  try {
    if (Capacitor.getPlatform() === 'android') {
      return (await SecureSecrets.getGeminiKey()).value || '';
    }
    return localStorage.getItem(WEB_KEY) || '';
  } catch {
    return '';
  }
}

async function writeSecretPayload(value: string): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    await SecureSecrets.setGeminiKey({ value });
  } else {
    localStorage.setItem(WEB_KEY, value);
  }
}

async function readKeyPool(): Promise<GeminiKeyPool> {
  const raw = await readSecretPayload();
  if (!raw) return emptyKeyPool();

  try {
    const parsed = JSON.parse(raw) as GeminiKeyPool;
    if (
      parsed?.version === KEY_POOL_VERSION &&
      Array.isArray(parsed.keys) &&
      parsed.keys.every((key) => typeof key?.value === 'string' && typeof key?.number === 'number')
    ) {
      return {
        version: KEY_POOL_VERSION,
        activeId: String(parsed.activeId || ''),
        nextNumber: Math.max(Number(parsed.nextNumber) || 1, 1),
        keys: parsed.keys
          .map((key) => ({
            id: String(key.id || ''),
            number: Number(key.number),
            value: String(key.value || '').trim(),
            verifiedAt: Number(key.verifiedAt) || 0,
          }))
          .filter((key) => key.id && key.value),
      };
    }
  } catch {}

  // Migration from the previous single-key format.
  const migrated: GeminiKeyPool = {
    version: KEY_POOL_VERSION,
    activeId: 'gk_1',
    nextNumber: 2,
    keys: [{
      id: 'gk_1',
      number: 1,
      value: raw.trim(),
      verifiedAt: aiVerified() ? Date.now() : 0,
    }],
  };
  await writeSecretPayload(JSON.stringify(migrated));
  return migrated;
}

async function writeKeyPool(pool: GeminiKeyPool): Promise<void> {
  if (!pool.keys.length) {
    if (Capacitor.getPlatform() === 'android') {
      try { await SecureSecrets.deleteGeminiKey(); } catch {}
    } else {
      localStorage.removeItem(WEB_KEY);
    }
    setAiVerified(false);
    return;
  }
  await writeSecretPayload(JSON.stringify(pool));
  setAiVerified(pool.keys.some((key) => key.verifiedAt > 0));
}

function orderedPoolKeys(pool: GeminiKeyPool): GeminiStoredKey[] {
  const active = pool.keys.find((key) => key.id === pool.activeId);
  const rest = pool.keys.filter((key) => key.id !== pool.activeId);
  return active ? [active, ...rest] : [...pool.keys];
}

export async function listGeminiKeys(): Promise<GeminiKeyMeta[]> {
  const pool = await readKeyPool();
  return pool.keys
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((key) => ({
      id: key.id,
      number: key.number,
      active: key.id === pool.activeId,
      verifiedAt: key.verifiedAt,
      masked: maskGeminiKey(key.value),
    }));
}

export async function findGeminiKeyNumber(value: string): Promise<number | null> {
  const clean = value.trim();
  if (!clean) return null;
  const pool = await readKeyPool();
  return pool.keys.find((key) => key.value === clean)?.number || null;
}

async function testGeminiKeyValue(value: string): Promise<void> {
  const model = geminiModel();
  const started = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': value,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'أجب بكلمة واحدة فقط: متصل' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 20 },
      }),
    }
  );

  let payload: any = null;
  try { payload = await response.json(); } catch {}
  const number = await findGeminiKeyNumber(value);
  if (!response.ok) {
    const apiMessage = payload?.error?.message || '';
    const message = [400, 401, 403].includes(response.status)
      ? (apiMessage || 'مفتاح Gemini غير صالح أو غير مخوّل.')
      : response.status === 429
        ? 'هذا المفتاح بلغ حد الطلبات حاليًا.'
        : (apiMessage || 'تعذر اختبار مفتاح Gemini.');
    logAiProviderEvent({
      provider: 'gemini-api',
      operation: 'اختبار مفتاح',
      model,
      keyNumber: number || undefined,
      status: 'error',
      httpStatus: response.status,
      durationMs: Date.now() - started,
      requestSummary: 'اختبار اتصال قصير',
      error: message,
    });
    throw new Error(message);
  }
  const text = responseText(payload);
  logAiProviderEvent({
    provider: 'gemini-api',
    operation: 'اختبار مفتاح',
    model,
    keyNumber: number || undefined,
    status: 'success',
    httpStatus: response.status,
    durationMs: Date.now() - started,
    requestSummary: 'اختبار اتصال قصير',
    responseSummary: text,
  });
}
export async function addVerifiedGeminiKey(value: string): Promise<GeminiKeyMeta> {
  const clean = value.trim();
  if (!clean) throw new Error('أدخل مفتاح Gemini API أولًا.');

  const existingNumber = await findGeminiKeyNumber(clean);
  if (existingNumber) throw new Error(`هذا المفتاح محفوظ مسبقًا باسم «مفتاح ${existingNumber}».`);

  await testGeminiKeyValue(clean);

  const pool = await readKeyPool();
  const number = pool.nextNumber;
  const key: GeminiStoredKey = {
    id: `gk_${Date.now().toString(36)}_${number}`,
    number,
    value: clean,
    verifiedAt: Date.now(),
  };
  pool.keys.push(key);
  pool.nextNumber = number + 1;
  if (!pool.activeId) pool.activeId = key.id;
  await writeKeyPool(pool);
  setAiEnabled(true);

  return {
    id: key.id,
    number: key.number,
    active: key.id === pool.activeId,
    verifiedAt: key.verifiedAt,
    masked: maskGeminiKey(key.value),
  };
}

// Backward-compatible helper: verified key is added rather than replacing existing keys.
export async function saveGeminiKey(value: string): Promise<void> {
  await addVerifiedGeminiKey(value);
}

export async function getGeminiKey(): Promise<string> {
  const pool = await readKeyPool();
  return orderedPoolKeys(pool).find((key) => key.verifiedAt > 0)?.value || '';
}

export async function selectGeminiKey(id: string): Promise<void> {
  const pool = await readKeyPool();
  if (!pool.keys.some((key) => key.id === id)) throw new Error('المفتاح غير موجود.');
  pool.activeId = id;
  await writeKeyPool(pool);
}

export async function deleteGeminiKeyById(id: string): Promise<void> {
  const pool = await readKeyPool();
  const removed = pool.keys.find((key) => key.id === id);
  if (!removed) return;
  pool.keys = pool.keys.filter((key) => key.id !== id);
  if (pool.activeId === id) {
    pool.activeId = pool.keys.find((key) => key.verifiedAt > 0)?.id || pool.keys[0]?.id || '';
  }
  await writeKeyPool(pool);
  if (!pool.keys.length) setAiEnabled(false);
}

export async function deleteGeminiKey(): Promise<void> {
  const pool = emptyKeyPool();
  await writeKeyPool(pool);
  setAiEnabled(false);
}

export async function verifyGeminiConnection(): Promise<void> {
  const pool = await readKeyPool();
  const ordered = orderedPoolKeys(pool);
  if (!ordered.length) throw new Error('لا يوجد مفتاح Gemini محفوظ.');

  let lastError = 'فشل اختبار جميع المفاتيح.';
  for (const key of ordered) {
    try {
      await testGeminiKeyValue(key.value);
      key.verifiedAt = Date.now();
      pool.activeId = key.id;
      await writeKeyPool(pool);
      setAiVerified(true);
      return;
    } catch (error: any) {
      lastError = error?.message || lastError;
    }
  }
  setAiVerified(false);
  throw new Error(lastError);
}

async function geminiFetchWithFailover(
  makeRequest: (key: string) => Promise<Response>,
  meta: { operation: string; requestSummary?: string; model?: string }
): Promise<{ response: Response; payload: any; keyNumber: number }> {
  const pool = await readKeyPool();
  const ordered = orderedPoolKeys(pool).filter((key) => key.verifiedAt > 0);
  if (!ordered.length) throw new Error('لا يوجد مفتاح Gemini متحقق وصالح.');

  let lastPayload: any = null;
  let lastStatus = 0;
  const attempts: Array<{ number: number; status: number | 'network' }> = [];

  for (let index = 0; index < ordered.length; index++) {
    const key = ordered[index];
    const started = Date.now();
    let response: Response;
    try {
      response = await makeRequest(key.value);
    } catch (error: any) {
      attempts.push({ number: key.number, status: 'network' });
      logAiProviderEvent({
        provider: 'gemini-api',
        operation: meta.operation,
        model: meta.model,
        keyNumber: key.number,
        attempt: index + 1,
        status: index < ordered.length - 1 ? 'retry' : 'error',
        httpStatus: 'network',
        durationMs: Date.now() - started,
        requestSummary: meta.requestSummary,
        error: error?.message || 'خطأ شبكة',
      });
      continue;
    }

    let payload: any = null;
    try { payload = await response.json(); } catch {}
    lastPayload = payload;
    lastStatus = response.status;
    attempts.push({ number: key.number, status: response.status });

    if (response.ok) {
      if (pool.activeId !== key.id) {
        pool.activeId = key.id;
        await writeKeyPool(pool);
      }
      logAiProviderEvent({
        provider: 'gemini-api',
        operation: meta.operation,
        model: meta.model,
        keyNumber: key.number,
        attempt: index + 1,
        status: 'success',
        httpStatus: response.status,
        durationMs: Date.now() - started,
        requestSummary: meta.requestSummary,
        responseSummary: responseText(payload),
      });
      return { response, payload, keyNumber: key.number };
    }

    const apiMessage = payload?.error?.message || '';
    const canRetry = [401, 403, 429].includes(response.status) && index < ordered.length - 1;
    logAiProviderEvent({
      provider: 'gemini-api',
      operation: meta.operation,
      model: meta.model,
      keyNumber: key.number,
      attempt: index + 1,
      status: canRetry ? 'retry' : 'error',
      httpStatus: response.status,
      durationMs: Date.now() - started,
      requestSummary: meta.requestSummary,
      error: apiMessage || `HTTP ${response.status}`,
    });

    if ([401, 403, 429].includes(response.status)) continue;
    return { response, payload, keyNumber: key.number };
  }

  const summary = attempts
    .map((attempt) => `مفتاح ${attempt.number}: ${attempt.status === 'network' ? 'خطأ شبكة' : attempt.status}`)
    .join('، ');

  const apiMessage = lastPayload?.error?.message || '';
  if (lastStatus === 429) {
    throw new Error(
      `فشلت جميع مفاتيح Gemini المتحققة بسبب حد الاستخدام (429). جُرّبت: ${summary}. إذا كانت المفاتيح من نفس Google Project فقد تشترك في نفس الحصة.`
    );
  }
  if (lastStatus === 401 || lastStatus === 403) {
    throw new Error(`فشلت مصادقة جميع مفاتيح Gemini. جُرّبت: ${summary}.`);
  }
  if (attempts.length && attempts.every((attempt) => attempt.status === 'network')) {
    throw new Error(`تعذر الوصول إلى Gemini عبر الشبكة. جُرّبت: ${summary}.`);
  }
  throw new Error(apiMessage || `تعذر الاتصال بـ Gemini. جُرّبت: ${summary || 'لا توجد محاولة مكتملة'}.`);
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

async function generateCloud(prompt: string, maxOutputTokens = 700, operation = 'نص Gemini'): Promise<string> {
  const model = geminiModel();
  const { response, payload } = await geminiFetchWithFailover((key) =>
    fetch(
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
    ),
    { operation, requestSummary: prompt, model }
  );

  if (!response.ok) {
    const apiMessage = payload?.error?.message || '';
    if (response.status === 400) throw new Error(apiMessage || 'طلب Gemini أو النموذج غير صالح.');
    throw new Error(apiMessage || 'تعذر الاتصال بخدمة Gemini.');
  }
  return responseText(payload);
}

async function generate(prompt: string, maxOutputTokens = 700, operation = 'نص Gemini'): Promise<string> {
  const mode = aiProviderMode();

  if (mode === 'nano') {
    return generateWithNano(prompt, operation);
  }

  if (mode === 'auto') {
    const local = await nanoStatus();
    if (local.available) {
      try {
        return await generateWithNano(prompt, operation);
      } catch {
        // Fall through to cloud when a verified API key exists.
      }
    }
  }

  if (!aiVerified()) {
    throw new Error(
      mode === 'auto'
        ? 'لا يوجد مزود AI جاهز. فعّل Gemini Nano المدعوم أو أضف Gemini API Key صالحًا.'
        : 'Gemini API غير متحقق. اختبر المفتاح من الإعدادات.'
    );
  }

  return generateCloud(prompt, maxOutputTokens, operation);
}

export async function aiReady(): Promise<boolean> {
  if (!aiEnabled()) return false;
  const mode = aiProviderMode();

  if (mode === 'nano') {
    return (await nanoStatus()).available;
  }

  if (mode === 'api') {
    return (await listGeminiKeys()).some((key) => key.verifiedAt > 0);
  }

  if ((await nanoStatus()).available) return true;
  return (await listGeminiKeys()).some((key) => key.verifiedAt > 0);
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




async function assertCloudAiReady(feature: string): Promise<void> {
  const mode = aiProviderMode();
  if (mode === 'nano') {
    throw new Error(`${feature} يحتاج Gemini API السحابي ولا يعمل في وضع Nano المحلي.`);
  }
  if (!(await listGeminiKeys()).some((key) => key.verifiedAt > 0)) {
    throw new Error(`${feature} يحتاج مفتاح Gemini API واحدًا على الأقل صالحًا ومتحققًا.`);
  }
}

export interface WebReferenceCandidate {
  title: string;
  url: string;
  domain: string;
  note: string;
}

export interface RichSearchItem {
  type: 'youtube' | 'image' | 'link';
  title: string;
  url: string;
  subtitle?: string;
  thumbnailUrl?: string;
}

function youtubeVideoId(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.replace(/^\//, '').split('/')[0] || '';
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
      const parts = parsed.pathname.split('/').filter(Boolean);
      const marker = parts.findIndex((part) => ['shorts', 'embed', 'live'].includes(part));
      if (marker >= 0) return parts[marker + 1] || '';
    }
  } catch {}
  return '';
}

function isDirectImageUrl(url: string): boolean {
  return /\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(url)
    || /(?:googleusercontent|gstatic|ytimg)\.com/i.test(url);
}

export async function searchRichWebContent(
  query: string,
  kind: 'youtube' | 'images' | 'links' = 'links'
): Promise<RichSearchItem[]> {
  const clean = query.trim().slice(0, 300);
  if (!clean) throw new Error('اكتب موضوعًا واضحًا للبحث.');

  const searchInstruction = kind === 'youtube'
    ? `ابحث فعليًا عن أفضل فيديوهات YouTube التعليمية المتعلقة بهذا الطلب: "${clean}". أعط أولوية للفيديوهات المباشرة على youtube.com أو youtu.be، وتجنب صفحات التجميع.`
    : kind === 'images'
      ? `ابحث فعليًا عن صور مفيدة وموثوقة مرتبطة بهذا الطلب: "${clean}". أعط أولوية لروابط الصور المباشرة من مصادر موثوقة مثل Wikimedia Commons أو مواقع المؤسسات الرسمية، وتجنب الصفحات التي لا تحتوي رابط صورة مباشر.`
      : `ابحث فعليًا عن روابط مفيدة وموثوقة مرتبطة بهذا الطلب: "${clean}".`;

  const payload = await generateWithTools(
    `${searchInstruction}
نفّذ Google Search فعليًا. لا تخترع روابط. استخدم فقط النتائج التي تظهر لك من البحث.`,
    [{ google_search: {} }],
    1200,
    kind === 'youtube' ? 'بحث YouTube' : kind === 'images' ? 'بحث صور' : 'بحث روابط'
  );

  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const items: RichSearchItem[] = [];

  for (const chunk of chunks) {
    const web = chunk?.web;
    const url = String(web?.uri || '').trim();
    if (!/^https:\/\//i.test(url) || seen.has(url)) continue;

    const domain = safeDomain(url);
    const title = String(web?.title || domain || 'رابط').trim().slice(0, 180);

    if (kind === 'youtube') {
      const id = youtubeVideoId(url);
      if (!id) continue;
      seen.add(url);
      items.push({
        type: 'youtube',
        title,
        url,
        subtitle: domain,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      });
    } else if (kind === 'images') {
      if (!isDirectImageUrl(url)) continue;
      seen.add(url);
      items.push({
        type: 'image',
        title,
        url,
        subtitle: domain,
        thumbnailUrl: url,
      });
    } else {
      seen.add(url);
      items.push({
        type: 'link',
        title,
        url,
        subtitle: domain,
      });
    }

    if (items.length >= 8) break;
  }

  if (!items.length) {
    if (kind === 'images') {
      throw new Error('لم أجد روابط صور مباشرة موثوقة لهذا الطلب. جرّب وصفًا أكثر تحديدًا.');
    }
    if (kind === 'youtube') {
      throw new Error('لم أجد روابط YouTube مباشرة لهذا الطلب. جرّب صياغة أكثر تحديدًا.');
    }
    throw new Error('لم أجد روابط مناسبة لهذا الطلب.');
  }

  return items;
}


function normalizeRichUrl(url: string): string {
  const value = String(url || '').trim();
  return /^https:\/\//i.test(value) ? value : '';
}

function normalizeRichResponse(parsed: any): GeminiRichResponse {
  const blocks: GeminiRichBlock[] = [];
  for (const rawBlock of Array.isArray(parsed?.blocks) ? parsed.blocks : []) {
    const type = String(rawBlock?.type || '');
    if (!['youtube','image','link'].includes(type)) continue;

    const items: GeminiRichItem[] = [];
    for (const rawItem of Array.isArray(rawBlock?.items) ? rawBlock.items : []) {
      const url = normalizeRichUrl(rawItem?.url);
      if (!url) continue;
      if (type === 'youtube' && !youtubeVideoId(url)) continue;

      const item: GeminiRichItem = {
        title: String(rawItem?.title || safeDomain(url) || 'رابط').trim().slice(0, 180),
        url,
        description: String(rawItem?.description || '').trim().slice(0, 500),
      };

      if (type === 'youtube') {
        const id = youtubeVideoId(url);
        item.thumbnailUrl = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
      } else if (type === 'image') {
        item.thumbnailUrl = normalizeRichUrl(rawItem?.thumbnailUrl) || url;
      }

      items.push(item);
      if (items.length >= 8) break;
    }

    if (!items.length) continue;
    blocks.push({
      type: type as GeminiRichBlock['type'],
      title: String(rawBlock?.title || '').trim().slice(0, 120) || (type === 'youtube' ? 'فيديوهات مقترحة' : type === 'image' ? 'صور' : 'روابط'),
      beforeText: String(rawBlock?.beforeText || '').trim().slice(0, 800) || undefined,
      afterText: String(rawBlock?.afterText || '').trim().slice(0, 800) || undefined,
      items,
    });
    if (blocks.length >= 6) break;
  }

  return {
    reply: String(parsed?.reply || '').trim().slice(0, 2000),
    blocks,
  };
}

export async function generateRichWebResponse(
  query: string,
  kinds: Array<'youtube' | 'images' | 'links'>
): Promise<GeminiRichResponse> {
  const cleanQuery = query.trim().slice(0, 600);
  const cleanKinds = Array.from(new Set(kinds.filter((kind) => ['youtube','images','links'].includes(kind)))).slice(0, 3);
  if (!cleanQuery) throw new Error('اكتب طلبًا واضحًا للبحث.');
  if (!cleanKinds.length) cleanKinds.push('links');

  const typeInstruction = cleanKinds.map((kind) =>
    kind === 'youtube'
      ? 'youtube: اجلب روابط فيديوهات YouTube حقيقية ومباشرة، مع عنوان ووصف مختصر.'
      : kind === 'images'
        ? 'image: اجلب روابط صور حقيقية يمكن عرضها، ويفضل روابط مباشرة أو صفحات موثوقة مع رابط صورة.'
        : 'link: اجلب روابط ويب مفيدة وموثوقة.'
  ).join('\n');

  const payload = await generateWithTools(
    `نفّذ Google Search فعليًا لتلبية طلب المستخدم التالي:
"${cleanQuery}"

الأنواع المطلوبة:
${typeInstruction}

أنت مسؤول عن اختيار أفضل النتائج وشرحها. لا تخترع روابط. استخدم فقط روابط عثرت عليها أثناء البحث.
أعد JSON صالحًا فقط بدون Markdown بهذه البنية:
{
  "reply":"مقدمة أو شرح مختصر",
  "blocks":[
    {
      "type":"youtube|image|link",
      "title":"عنوان القسم",
      "beforeText":"نص اختياري قبل القسم",
      "afterText":"نص اختياري بعد القسم",
      "items":[
        {"title":"...","url":"https://...","description":"سبب الاختيار أو شرح مختصر","thumbnailUrl":"https://..."}
      ]
    }
  ]
}
لا تُرجع source_picker هنا. هذه نتائج نهائية للعرض داخل المحادثة.`,
    [{ google_search: {} }],
    2600,
    'Rich Web JSON'
  );

  const raw = responseText(payload);
  let parsed: any;
  try {
    parsed = parseJsonObject(raw);
  } catch {
    // Fallback to grounded links if the model did not keep JSON valid.
    const fallbackBlocks: GeminiRichBlock[] = [];
    for (const kind of cleanKinds) {
      const items = await searchRichWebContent(cleanQuery, kind);
      fallbackBlocks.push({
        type: kind === 'images' ? 'image' : kind === 'links' ? 'link' : 'youtube',
        title: kind === 'youtube' ? 'فيديوهات مقترحة' : kind === 'images' ? 'صور مرتبطة' : 'روابط مفيدة',
        items: items.map((item) => ({
          title: item.title,
          url: item.url,
          description: item.subtitle,
          thumbnailUrl: item.thumbnailUrl,
        })),
      });
    }
    return { reply: 'هذه أفضل النتائج التي عثرت عليها.', blocks: fallbackBlocks };
  }

  const normalized = normalizeRichResponse(parsed);
  if (!normalized.blocks.length) {
    throw new Error('أعاد Gemini نتيجة بحث بدون روابط قابلة للعرض.');
  }
  return normalized;
}

async function generateWithTools(
  prompt: string,
  tools: Array<Record<string, unknown>>,
  maxOutputTokens = 1400,
  operation = 'Web tools'
): Promise<any> {
  await assertCloudAiReady('أدوات البحث والروابط');
  const model = geminiModel();

  const { response, payload } = await geminiFetchWithFailover((key) =>
    fetch(
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
    ),
    { operation, requestSummary: prompt, model }
  );

  if (!response.ok) {
    const apiMessage = payload?.error?.message || '';
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
    1200,
    'اقتراح مصادر للبناء'
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
    5200,
    'إنشاء بنك من روابط'
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

export type StudyAssistantAction = 'respond' | 'source_picker' | 'web_content' | 'generate_bank';

export interface StudyAssistantDecision {
  reply: string;
  intent: 'chat' | 'progress' | 'bank' | 'topic' | 'references';
  action: StudyAssistantAction;
  taskStatus: 'idle' | 'collecting' | 'ready' | 'review' | 'done';
  bankName?: string;
  topic?: string;
  expectedQuestions?: number;
  sourcePicker?: boolean;
  webKinds?: Array<'youtube' | 'images' | 'links'>;
  requestConfirmation?: boolean;
  shouldGenerateBank?: boolean;
}

export interface GeminiRichItem {
  title: string;
  url: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface GeminiRichBlock {
  type: 'youtube' | 'image' | 'link';
  title: string;
  beforeText?: string;
  afterText?: string;
  items: GeminiRichItem[];
}

export interface GeminiRichResponse {
  reply: string;
  blocks: GeminiRichBlock[];
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

export async function runStudyAssistant(
  context: StudyAssistantContext,
  sources: MixedAiSource[] = []
): Promise<StudyAssistantDecision> {
  const sourceSummary = sources.map((source) => ({
    title: source.title,
    kind: source.kind,
    mimeType: source.mimeType || '',
    url: source.url || '',
  }));

  const prompt = `أنت منسق ذكي لمساعد دراسة داخل تطبيق. التطبيق يدير الحالة وينفذ أوامرك، وأنت تعيد قرارًا منظمًا بصيغة JSON فقط.

قواعد القرار:
1) أجب بالعربية، ولا تدّع تنفيذ شيء لم يُنفذ بعد.
2) فرّق بدقة بين "مصادر لبناء شيء" وبين "محتوى أريد مشاهدته الآن".
3) source_picker يُستخدم فقط عندما تكون المهمة إنشاء بنك أسئلة أو إنشاء/تجميع مرجع دراسي ويحتاج المستخدم اختيار المصادر التي سيُبنى منها الناتج.
4) في source_picker: اقترح التطبيق مصادر ويب للمستخدم، ويمكن للمستخدم أيضًا إضافة رابط أو ملف أو صورة أو بنك موجود أو مرجع محفوظ. لا تجعل source_picker يظهر لمجرد طلب فيديو أو صورة أو رابط مفيد.
5) إذا قال المستخدم "اجلب أفضل درس يوتيوب" أو "فيديوهات" أو "صور" أو "روابط مفيدة" أو طلب شرحًا مدعومًا بوسائط، استخدم action="web_content" وحدد webKinds المناسبة. Gemini سيجري البحث في خطوة لاحقة ويعيد روابط ووسائط منظمة.
6) إذا كان الطلب مجرد شرح/محادثة/تحليل تقدم ولا يحتاج بحث ويب، استخدم action="respond".
7) إذا كان المستخدم يبني بنكًا وكانت البيانات والمصادر المختارة مكتملة وطلب الإنشاء، استخدم action="generate_bank" وshouldGenerateBank=true.
8) إذا كان إنشاء البنك يحتاج مصادر ولم تُحدد بعد، استخدم action="source_picker" وsourcePicker=true.
9) لا تجعل سياق مهمة قديمة يجبر طلبًا جديدًا مستقلًا على نفس المهمة. طلب YouTube أو صور جديد يعامل كمحتوى مستقل ما لم يربطه المستخدم صراحة بالبنك الحالي.
10) المرفقات التي يرسلها التطبيق مرئية لك في هذا الطلب؛ استخدمها عند الإجابة.
11) تحليل التقدم يعتمد فقط على app.stats.
12) ممنوع أن تقول "اطلب من التطبيق" أو "اضغط زر البحث". أنت تُرجع action والتطبيق ينفذه.

أعد JSON صالحًا فقط، بدون Markdown:
{"reply":"...","intent":"chat|progress|bank|topic|references","action":"respond|source_picker|web_content|generate_bank","taskStatus":"idle|collecting|ready|review|done","bankName":"","topic":"","expectedQuestions":20,"sourcePicker":false,"webKinds":["youtube|images|links"],"requestConfirmation":false,"shouldGenerateBank":false}

السياق الحالي:
${JSON.stringify(context)}

المصادر المرفقة بهذا الطلب:
${JSON.stringify(sourceSummary)}`;

  let raw = '';

  if (sources.length === 0) {
    raw = await generate(prompt, 1200, 'Planner JSON');
  } else {
    assertMixedSourcePayload(sources);

    const onlyTextSources = sources.every((source) => source.kind === 'text');
    const mode = aiProviderMode();
    if (onlyTextSources && mode !== 'api') {
      const nano = await nanoStatus();
      if (nano.available) {
        const textSources = sources
          .map((source) => `[مصدر مرفق: ${source.title}]\n${cleanReferenceText(source.text || '')}`)
          .join('\n\n');
        raw = await generateWithNano(`${prompt}\n\n${textSources}`, 'Planner JSON');
      } else if (mode === 'nano') {
        throw new Error('Gemini Nano غير متاح على هذا الجهاز.');
      }
    }

    if (!raw) {
      await assertCloudAiReady('المرفقات متعددة الوسائط أو الروابط');
      const model = geminiModel();
    const parts: any[] = [{ text: prompt }];
    let needsUrlContext = false;

    for (const source of sources.slice(0, 8)) {
      if (source.kind === 'text' && source.text?.trim()) {
        parts.push({
          text: `\n\n[مصدر مرفق: ${source.title}]\n${cleanReferenceText(source.text)}`,
        });
      } else if (source.kind === 'url' && source.url) {
        needsUrlContext = true;
        parts.push({
          text: `\n[رابط مصدر مرفق: ${source.title}] ${source.url}`,
        });
      } else if (source.kind === 'inline' && source.base64 && source.mimeType) {
        parts.push({
          inlineData: {
            mimeType: source.mimeType,
            data: source.base64,
          },
        });
        parts.push({
          text: `[المرفق السابق مصدر بعنوان: ${source.title}. اقرأه للإجابة عن طلب المستخدم.]`,
        });
      }
    }

    const body: any = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1200,
      },
    };
    if (needsUrlContext) body.tools = [{ url_context: {} }];

    const { response, payload } = await geminiFetchWithFailover((activeKey) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': activeKey,
          },
          body: JSON.stringify(body),
        }
      ),
      { operation: 'Planner + مرفقات', requestSummary: prompt, model }
    );

    if (!response.ok) {
      const apiMessage = payload?.error?.message || '';
      throw new Error(apiMessage || 'تعذر إرسال المرفقات إلى Gemini.');
    }

      raw = responseText(payload);
    }
  }

  const parsed = parseJsonObject(raw);
  const action: StudyAssistantAction = ['respond','source_picker','web_content','generate_bank'].includes(parsed.action)
    ? parsed.action
    : (parsed.shouldGenerateBank ? 'generate_bank' : parsed.sourcePicker ? 'source_picker' : 'respond');
  const webKinds = Array.isArray(parsed.webKinds)
    ? parsed.webKinds.filter((kind: unknown) => ['youtube','images','links'].includes(String(kind))).slice(0, 3)
    : [];

  return {
    reply: String(parsed.reply || '').trim() || 'تم فهم الطلب.',
    intent: ['chat','progress','bank','topic','references'].includes(parsed.intent) ? parsed.intent : 'chat',
    action,
    taskStatus: ['idle','collecting','ready','review','done'].includes(parsed.taskStatus) ? parsed.taskStatus : 'idle',
    bankName: String(parsed.bankName || '').trim().slice(0, 80),
    topic: String(parsed.topic || '').trim().slice(0, 200),
    expectedQuestions: Math.min(Math.max(Number(parsed.expectedQuestions) || 20, 5), 100),
    sourcePicker: action === 'source_picker' || Boolean(parsed.sourcePicker),
    webKinds,
    requestConfirmation: Boolean(parsed.requestConfirmation),
    shouldGenerateBank: action === 'generate_bank' || Boolean(parsed.shouldGenerateBank),
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

export function approximateMixedSourceBytes(source: MixedAiSource): number {
  if (source.kind === 'inline' && source.base64) {
    return Math.floor((source.base64.length * 3) / 4);
  }
  if (source.kind === 'text' && source.text) {
    return new Blob([source.text]).size;
  }
  if (source.kind === 'url' && source.url) {
    return new Blob([source.url]).size;
  }
  return 0;
}

function assertMixedSourcePayload(sources: MixedAiSource[]): void {
  const total = sources.reduce((sum, source) => sum + approximateMixedSourceBytes(source), 0);
  const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
  if (total > MAX_TOTAL_BYTES) {
    throw new Error('إجمالي المرفقات كبير جدًا. خفّضها إلى أقل من 24 MB تقريبًا قبل الإرسال إلى Gemini.');
  }
}

export async function generateBankFromMixedSources(input: {
  bankName: string;
  topic: string;
  count: number;
  sources: MixedAiSource[];
}): Promise<GeneratedBankQuestion[]> {
  const sources = input.sources.slice(0, 8);
  if (!sources.length) throw new Error('أضف مصدرًا واحدًا على الأقل قبل إنشاء البنك.');
  assertMixedSourcePayload(sources);
  await assertCloudAiReady('إنشاء بنك من ملفات/صور/روابط');

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

  const { response, payload } = await geminiFetchWithFailover((activeKey) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': activeKey,
        },
        body: JSON.stringify(body),
      }
    ),
    { operation: 'إنشاء بنك من مصادر', requestSummary: `${input.bankName} | ${input.topic} | ${sources.length} مصادر`, model }
  );

  if (!response.ok) {
    const apiMessage = payload?.error?.message || '';
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
