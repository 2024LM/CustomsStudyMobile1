import * as XLSX from 'xlsx';
import { ExcelPreview, ImportedQuestion } from '../types';

const HEADERS = [
  'ID',
  'السؤال',
  'الجواب الصحيح',
  'خيار خاطئ 1',
  'خيار خاطئ 2',
  'خيار خاطئ 3',
  'الشرح',
  'المحور',
];

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_TEXT = 2000;

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export async function parseExcelFile(file: File): Promise<ExcelPreview> {
  const sourceName = file.name || 'questions.xlsx';

  if (file.size > MAX_BYTES) {
    return {
      rows: [],
      errors: ['حجم الملف يتجاوز 5 MB'],
      sourceName,
      valid: false,
    };
  }

  const errors: string[] = [];
  const rows: ImportedQuestion[] = [];
  const seenIds = new Set<string>();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    if (!workbook.SheetNames || workbook.SheetNames.length < 1) {
      return {
        rows: [],
        errors: ['الملف لا يحتوي على ورقة عمل'],
        sourceName,
        valid: false,
      };
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      return {
        rows: [],
        errors: ['تعذر قراءة ورقة العمل'],
        sourceName,
        valid: false,
      };
    }

    // Convert sheet to row array
    const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, raw: false });
    if (!rawData || rawData.length === 0) {
      return {
        rows: [],
        errors: ['صف العناوين مفقود'],
        sourceName,
        valid: false,
      };
    }

    const headerRow = rawData[0] || [];
    for (let i = 0; i < HEADERS.length; i++) {
      const expected = HEADERS[i];
      const actual = String(headerRow[i] || '').trim();
      if (actual !== expected) {
        errors.push(`العمود ${i + 1} يجب أن يكون: ${expected}`);
      }
    }

    if (errors.length > 0) {
      return {
        rows: [],
        errors,
        sourceName,
        valid: false,
      };
    }

    if (rawData.length - 1 > MAX_ROWS) {
      errors.push('الحد الأقصى 5000 سؤال');
    }

    const maxIndex = Math.min(rawData.length, MAX_ROWS + 1);

    for (let r = 1; r < maxIndex; r++) {
      const row = rawData[r] || [];
      const rowNumber = r + 1;

      const cellVal = (c: number): string => {
        const val = row[c];
        if (val === undefined || val === null) return '';
        const str = String(val).trim();
        // Check if formula
        if (str.startsWith('=')) {
          errors.push(`السطر ${rowNumber}: الصيغ غير مسموحة`);
          return '';
        }
        return str;
      };

      const id = cellVal(0);
      const q = cellVal(1);
      const a = cellVal(2);
      const w1 = cellVal(3);
      const w2 = cellVal(4);
      const w3 = cellVal(5);
      const exp = cellVal(6);
      const topic = cellVal(7);

      // Skip completely empty rows
      if (!id && !q && !a && !w1 && !w2 && !w3 && !exp && !topic) {
        continue;
      }

      if (!id || !q || !a || !w1 || !w2 || !w3) {
        errors.push(`السطر ${rowNumber}: ID والسؤال والإجابة والخيارات الثلاثة مطلوبة`);
        continue;
      }

      if (seenIds.has(id)) {
        errors.push(`السطر ${rowNumber}: ID مكرر (${id})`);
        continue;
      }
      seenIds.add(id);

      const distinctOptions = new Set([a, w1, w2, w3].map(normalized));
      if (distinctOptions.size !== 4) {
        errors.push(`السطر ${rowNumber}: الخيارات الأربعة يجب أن تكون مختلفة`);
        continue;
      }

      if ([q, a, w1, w2, w3, exp, topic].some((text) => text.length > MAX_TEXT)) {
        errors.push(`السطر ${rowNumber}: يوجد نص يتجاوز ${MAX_TEXT} حرف`);
        continue;
      }

      rows.push({
        externalId: id,
        question: q,
        answer: a,
        wrong1: w1,
        wrong2: w2,
        wrong3: w3,
        explanation: exp,
        topic,
      });
    }
  } catch (e: any) {
    errors.push('ملف XLSX غير صالح أو تالف: ' + (e?.message || 'خطأ غير معروف'));
  }

  return {
    rows,
    errors: errors.slice(0, 100),
    sourceName,
    valid: errors.length === 0 && rows.length > 0,
  };
}
