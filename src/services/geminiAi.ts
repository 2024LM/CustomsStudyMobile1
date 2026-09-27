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
