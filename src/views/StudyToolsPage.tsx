import React, { useMemo, useState } from 'react';
import { PlusCircle, Save, Search, StickyNote, Trash2 } from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { db } from '../services/db';
import { FloatingNotice } from '../components/FloatingNotice';

type ToolTab = 'search' | 'notes' | 'manual';

export const StudyToolsPage: React.FC = () => {
  const [tab, setTab] = useState<ToolTab>('search');
  const [query, setQuery] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [status, setStatus] = useState('');
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

  const searchResults = useMemo(
    () => query.trim().length >= 2 ? db.searchAcrossActiveDomain(query) : [],
    [query]
  );
  const notes = db.notedQuestions();
  const banks = db.banks();

  const saveNote = (rowId: number) => {
    db.setQuestionNote(rowId, noteDrafts[rowId] ?? db.questionNote(rowId));
    setStatus('تم حفظ الملاحظة.');
  };

  const addManualQuestion = () => {
    try {
      db.addManualQuestion(manual);
      setManual({
        bankId: manual.bankId,
        question: '',
        correctAnswer: '',
        wrong1: '',
        wrong2: '',
        wrong3: '',
        explanation: '',
        topic: '',
      });
      setStatus('تمت إضافة السؤال إلى البنك بنجاح.');
    } catch (error: any) {
      setStatus(error?.message || 'تعذر إضافة السؤال.');
    }
  };

  const tabs = [
    { id: 'search' as const, label: 'بحث شامل', icon: Search },
    { id: 'notes' as const, label: 'ملاحظات', icon: StickyNote },
    { id: 'manual' as const, label: 'سؤال يدوي', icon: PlusCircle },
  ];

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <ScreenHeader title="أدوات الدراسة" subtitle="البحث والملاحظات وإنشاء الأسئلة" />

      <div className="grid grid-cols-3 gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setStatus(''); }}
            className={`rounded-[14px] border p-3 text-xs font-bold flex flex-col items-center gap-1.5 ${
              tab === id ? 'bg-[#5B3FD6] border-[#5B3FD6] text-white' : 'bg-white border-gray-100 text-gray-600'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <FloatingNotice message={status} onDismiss={() => setStatus('')} />

      {tab === 'search' && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في كل بنوك المجال..."
              className="w-full h-12 rounded-[16px] bg-white border border-gray-100 pr-11 pl-4 text-sm outline-none focus:border-[#5B3FD6]" />
          </div>

          {query.trim().length < 2 && (
            <div className="bg-white rounded-[18px] p-5 text-center text-xs text-gray-400 border border-gray-100">
              اكتب حرفين على الأقل للبحث في السؤال والمحور والشرح والإجابة.
            </div>
          )}

          {searchResults.map(({ question, bankName }) => {
            const current = noteDrafts[question.rowId] ?? db.questionNote(question.rowId);
            return (
              <div key={question.rowId} className="bg-white rounded-[18px] p-4 border border-gray-100 flex flex-col gap-3">
                <div>
                  <div className="text-[10px] text-[#5B3FD6] font-bold mb-1">{bankName}</div>
                  <h3 className="font-bold text-sm text-[#2C2145] leading-6">{question.question}</h3>
                  {question.topic && <div className="text-[11px] text-gray-400 mt-1">{question.topic}</div>}
                </div>
                <textarea value={current}
                  onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [question.rowId]: e.target.value }))}
                  placeholder="أضف ملاحظة لهذا السؤال..." rows={2}
                  className="w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-xs outline-none focus:border-[#5B3FD6]" />
                <button onClick={() => saveNote(question.rowId)}
                  className="self-start px-3 py-2 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] text-xs font-bold flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> حفظ الملاحظة
                </button>
              </div>
            );
          })}

          {query.trim().length >= 2 && searchResults.length === 0 && (
            <div className="bg-white rounded-[18px] p-5 text-center text-xs text-gray-400 border border-gray-100">لا توجد نتائج مطابقة.</div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="flex flex-col gap-3">
          {notes.length === 0 ? (
            <div className="bg-white rounded-[18px] p-6 text-center text-xs text-gray-400 border border-gray-100">لا توجد ملاحظات محفوظة بعد.</div>
          ) : notes.map(({ question, note }) => (
            <div key={question.rowId} className="bg-white rounded-[18px] p-4 border border-gray-100">
              <h3 className="font-bold text-sm leading-6">{question.question}</h3>
              <p className="text-xs text-gray-600 leading-6 mt-2 whitespace-pre-wrap">{note}</p>
              <button onClick={() => { db.setQuestionNote(question.rowId, ''); setStatus('تم حذف الملاحظة.'); }}
                className="mt-3 text-red-500 text-xs font-bold flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> حذف الملاحظة
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'manual' && (
        <div className="bg-white rounded-[20px] p-4 border border-gray-100 flex flex-col gap-3">
          <select value={manual.bankId} onChange={(e) => setManual((v) => ({ ...v, bankId: e.target.value }))}
            className="w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm">
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
            <textarea key={key} value={(manual as any)[key]}
              onChange={(e) => setManual((v) => ({ ...v, [key]: e.target.value }))}
              rows={key === 'question' || key === 'explanation' ? 3 : 1}
              placeholder={label}
              className="w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm outline-none focus:border-[#5B3FD6]" />
          ))}

          <button onClick={addManualQuestion}
            className="w-full py-3 rounded-[13px] bg-[#5B3FD6] text-white text-sm font-bold flex items-center justify-center gap-2">
            <PlusCircle className="w-4 h-4" /> إضافة السؤال
          </button>
        </div>
      )}
    </div>
  );
};
