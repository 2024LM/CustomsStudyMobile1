import * as mammoth from 'mammoth';
import { db } from './db';
import { LocalReference } from './localReferences';
import { MixedAiSource } from './geminiAi';

const MAX_INLINE_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 30000;

function base64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('تعذر قراءة الملف.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function cleanText(value: string): string {
  return value.replace(/\u0000/g, '').trim().slice(0, MAX_TEXT_CHARS);
}

export async function sourceFromFile(file: File): Promise<MixedAiSource> {
  if (!file.size) throw new Error('الملف فارغ.');
  const mime = (file.type || '').toLowerCase();
  const name = file.name || 'ملف مرفق';
  const ext = name.toLowerCase().split('.').pop() || '';

  const allowedImageMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const allowedImageExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

  if (allowedImageMimes.has(mime) || allowedImageExts.has(ext)) {
    if (file.size > MAX_INLINE_BYTES) throw new Error('حجم الصورة كبير جدًا. الحد الحالي 12 MB.');
    const imageMime = allowedImageMimes.has(mime)
      ? mime
      : ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
            : 'image/jpeg';
    return {
      id: 'file_' + Date.now().toString(36),
      title: name,
      kind: 'inline',
      mimeType: imageMime,
      base64: await base64FromBlob(file),
    };
  }

  if (mime === 'application/pdf' || ext === 'pdf') {
    if (file.size > MAX_INLINE_BYTES) throw new Error('حجم PDF كبير جدًا. الحد الحالي 12 MB.');
    return {
      id: 'file_' + Date.now().toString(36),
      title: name,
      kind: 'inline',
      mimeType: 'application/pdf',
      base64: await base64FromBlob(file),
    };
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = cleanText(result.value);
    if (!text) throw new Error('تعذر استخراج نص من ملف Word.');
    return {
      id: 'file_' + Date.now().toString(36),
      title: name,
      kind: 'text',
      text,
    };
  }

  if (ext === 'txt' || ext === 'md') {
    const text = cleanText(await file.text());
    if (!text) throw new Error('الملف لا يحتوي نصًا قابلًا للاستخدام.');
    return {
      id: 'file_' + Date.now().toString(36),
      title: name,
      kind: 'text',
      text,
    };
  }

  throw new Error('نوع الملف غير مدعوم. المسموح فقط: JPG/JPEG/PNG/WEBP/GIF وPDF وDOCX وTXT وMD. لا يمكن إرسال ZIP أو RAR أو APK أو EXE.');
}

export function sourceFromBank(bankId: string): MixedAiSource {
  const bank = db.banks().find((item) => item.id === bankId);
  if (!bank) throw new Error('تعذر العثور على البنك.');

  const text = db.questions(bankId)
    .slice(0, 250)
    .map((q, index) => [
      `سؤال ${index + 1}: ${q.question}`,
      `الإجابة: ${q.correctAnswer}`,
      q.explanation ? `الشرح: ${q.explanation}` : '',
      q.topic ? `المحور: ${q.topic}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n')
    .slice(0, MAX_TEXT_CHARS);

  if (!text.trim()) throw new Error('البنك لا يحتوي أسئلة يمكن استخدامها كمصدر.');

  return {
    id: 'bank_' + bank.id,
    title: `بنك: ${bank.name}`,
    kind: 'text',
    text,
  };
}

export async function sourceFromLocalReference(item: LocalReference): Promise<MixedAiSource> {
  if (item.type === 'pdf') {
    if (item.data.size > MAX_INLINE_BYTES) throw new Error('حجم PDF أكبر من الحد الحالي 12 MB.');
    return {
      id: 'ref_' + item.id,
      title: `مرجع: ${item.name}`,
      kind: 'inline',
      mimeType: item.mimeType || 'application/pdf',
      base64: await base64FromBlob(item.data),
    };
  }

  if (item.type === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await item.data.arrayBuffer() });
    const text = cleanText(result.value);
    if (!text) throw new Error('تعذر استخراج نص من المرجع.');
    return {
      id: 'ref_' + item.id,
      title: `مرجع: ${item.name}`,
      kind: 'text',
      text,
    };
  }

  const text = cleanText(await item.data.text());
  if (!text) throw new Error('المرجع لا يحتوي نصًا قابلًا للاستخدام.');
  return {
    id: 'ref_' + item.id,
    title: `مرجع: ${item.name}`,
    kind: 'text',
    text,
  };
}
