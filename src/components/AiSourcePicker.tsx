import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, FileUp, Globe2, Image as ImageIcon, Library, LoaderCircle, Plus, X } from 'lucide-react';
import { db } from '../services/db';
import { listLocalReferences, LocalReference } from '../services/localReferences';
import { MixedAiSource } from '../services/geminiAi';
import { sourceFromBank, sourceFromFile, sourceFromLocalReference } from '../services/aiSourceAdapters';

interface Props {
  disabled?: boolean;
  onAdd: (source: MixedAiSource) => void;
  onSearchWeb: () => void;
  onStatus: (message: string) => void;
}

type Panel = null | 'menu' | 'banks' | 'refs';

export const AiSourcePicker: React.FC<Props> = ({ disabled, onAdd, onSearchWeb, onStatus }) => {
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [refs, setRefs] = useState<LocalReference[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (panel !== 'refs') return;
    void listLocalReferences(db.activeDomainId()).then(setRefs).catch(() => setRefs([]));
  }, [panel]);

  const addFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const source = await sourceFromFile(file);
      onAdd(source);
      onStatus(`تمت إضافة «${source.title}» إلى مصادر المهمة.`);
      setPanel(null);
    } catch (e: any) {
      onStatus(e?.message || 'تعذر إضافة المصدر.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      if (imageRef.current) imageRef.current.value = '';
    }
  };

  const addBank = (bankId: string) => {
    try {
      const source = sourceFromBank(bankId);
      onAdd(source);
      onStatus(`تمت إضافة «${source.title}».`);
      setPanel(null);
    } catch (e: any) {
      onStatus(e?.message || 'تعذر إضافة البنك.');
    }
  };

  const addRef = async (item: LocalReference) => {
    setBusy(true);
    try {
      const source = await sourceFromLocalReference(item);
      onAdd(source);
      onStatus(`تمت إضافة «${source.title}».`);
      setPanel(null);
    } catch (e: any) {
      onStatus(e?.message || 'تعذر إضافة المرجع.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void addFile(e.target.files?.[0] || null)} />
      <input ref={imageRef} type="file" className="hidden" accept="image/*" onChange={(e) => void addFile(e.target.files?.[0] || null)} />

      <button
        onClick={() => setPanel(panel ? null : 'menu')}
        disabled={disabled || busy}
        className="w-12 h-12 rounded-[16px] bg-white dark:bg-[#211D2C] border border-[#DCD5EC] dark:border-[#4A4057] flex items-center justify-center text-[#5B3FD6] shadow-xl disabled:opacity-40"
        aria-label="إضافة مصدر"
      >
        {busy ? <LoaderCircle className="w-5 h-5 animate-spin" /> : panel ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
      </button>

      {panel && (
        <div className="absolute bottom-14 right-0 w-72 max-h-[56vh] overflow-y-auto rounded-[18px] bg-white dark:bg-[#211D2C] border border-gray-100 dark:border-[#3A3348] shadow-2xl p-2 z-50">
          {panel === 'menu' && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => fileRef.current?.click()} className="rounded-[13px] p-3 bg-[#F8F9FD] dark:bg-[#191621] text-xs font-bold flex flex-col items-center gap-2"><FileUp className="w-5 h-5 text-[#5B3FD6]" />ملف</button>
              <button onClick={() => imageRef.current?.click()} className="rounded-[13px] p-3 bg-[#F8F9FD] dark:bg-[#191621] text-xs font-bold flex flex-col items-center gap-2"><ImageIcon className="w-5 h-5 text-[#5B3FD6]" />صورة</button>
              <button onClick={() => setPanel('banks')} className="rounded-[13px] p-3 bg-[#F8F9FD] dark:bg-[#191621] text-xs font-bold flex flex-col items-center gap-2"><BookOpen className="w-5 h-5 text-[#5B3FD6]" />بنك موجود</button>
              <button onClick={() => setPanel('refs')} className="rounded-[13px] p-3 bg-[#F8F9FD] dark:bg-[#191621] text-xs font-bold flex flex-col items-center gap-2"><Library className="w-5 h-5 text-[#5B3FD6]" />مرجع</button>
              <button onClick={() => { setPanel(null); onSearchWeb(); }} className="col-span-2 rounded-[13px] p-3 bg-[#F5F3FF] dark:bg-[#302844] text-[#5B3FD6] dark:text-[#C8BAFF] text-xs font-bold flex items-center justify-center gap-2"><Globe2 className="w-5 h-5" />اقتراح مصادر من الويب</button>
            </div>
          )}

          {panel === 'banks' && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-black px-1 py-2">اختر بنكًا</div>
              {db.banks().map((bank) => (
                <button key={bank.id} onClick={() => addBank(bank.id)} className="text-right rounded-[12px] p-3 bg-[#F8F9FD] dark:bg-[#191621]">
                  <div className="text-xs font-bold">{bank.name}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{db.questionCount(bank.id)} سؤال</div>
                </button>
              ))}
            </div>
          )}

          {panel === 'refs' && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-black px-1 py-2">اختر مرجعًا</div>
              {refs.length === 0 ? <div className="text-[11px] text-gray-400 p-3">لا توجد مراجع محفوظة.</div> : refs.map((item) => (
                <button key={item.id} onClick={() => void addRef(item)} className="text-right rounded-[12px] p-3 bg-[#F8F9FD] dark:bg-[#191621]">
                  <div className="text-xs font-bold">{item.name}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{item.type.toUpperCase()}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
