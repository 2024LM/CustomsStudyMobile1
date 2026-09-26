import React, { useMemo, useState } from 'react';
import { CheckCircle2, FolderPlus, Layers3, Trash2 } from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { db } from '../services/db';

interface DomainsPageProps {
  onDomainSelected?: () => void;
}

export const DomainsPage: React.FC<DomainsPageProps> = ({ onDomainSelected }) => {
  const [, setRefresh] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');

  const domains = db.domains();
  const activeId = db.activeDomainId();

  const stats = useMemo(() => {
    return new Map(
      domains.map((domain) => [
        domain.id,
        {
          banks: db.domainBankCount(domain.id),
          questions: db.domainQuestionCount(domain.id),
        },
      ])
    );
  }, [domains.map((domain) => domain.id).join('|'), activeId]);

  const createDomain = () => {
    try {
      db.createDomain(name, description);
      setName('');
      setDescription('');
      setStatus('تم إنشاء المجال وتفعيله مع بنك رئيسي فارغ.');
      setRefresh((value) => value + 1);
      onDomainSelected?.();
    } catch (error: any) {
      setStatus(error?.message || 'تعذر إنشاء المجال');
    }
  };

  const selectDomain = (domainId: string) => {
    try {
      db.setActiveDomain(domainId);
      setStatus('تم تغيير المجال النشط.');
      setRefresh((value) => value + 1);
      onDomainSelected?.();
    } catch (error: any) {
      setStatus(error?.message || 'تعذر تغيير المجال');
    }
  };

  const deleteDomain = (domainId: string) => {
    if (!window.confirm('سيتم إخفاء المجال وبنوكه وأسئلته من التطبيق. هل تريد المتابعة؟')) return;
    try {
      db.deleteUserDomain(domainId);
      setStatus('تمت إزالة المجال.');
      setRefresh((value) => value + 1);
      onDomainSelected?.();
    } catch (error: any) {
      setStatus(error?.message || 'تعذر إزالة المجال');
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <ScreenHeader
        title="مجالات الدراسة"
        subtitle="افصل كل تخصص في مجال مستقل مع بنوكه وإحصائياته"
      />

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FolderPlus className="w-5 h-5 text-[#5B3FD6]" />
          <h3 className="font-bold text-sm text-[#2C2145]">إنشاء مجال جديد</h3>
        </div>

        <input
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 80))}
          placeholder="مثال: الشرطة، القانون، التمريض..."
          className="w-full rounded-[14px] bg-[#F8F9FD] border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#5B3FD6]"
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, 300))}
          placeholder="وصف اختياري للمجال"
          rows={3}
          className="w-full rounded-[14px] bg-[#F8F9FD] border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#5B3FD6] resize-none"
        />
        <button
          onClick={createDomain}
          disabled={name.trim().length < 2}
          className="w-full h-12 rounded-[15px] bg-[#5B3FD6] text-white font-bold text-sm disabled:opacity-40"
        >
          إنشاء المجال
        </button>
      </div>

      {status && (
        <div className="rounded-[14px] bg-[#F5F3FF] text-[#5B3FD6] px-3 py-2.5 text-xs font-semibold">
          {status}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {domains.map((domain) => {
          const selected = domain.id === activeId;
          const domainStats = stats.get(domain.id) || { banks: 0, questions: 0 };

          return (
            <div
              key={domain.id}
              className={`rounded-[20px] border p-4 shadow-xs transition-all ${
                selected
                  ? 'bg-[#F5F3FF] border-[#5B3FD6]'
                  : 'bg-white border-gray-100'
              }`}
            >
              <button
                onClick={() => selectDomain(domain.id)}
                className="w-full flex items-center justify-between gap-3 text-right"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 ${
                    selected ? 'bg-[#5B3FD6] text-white' : 'bg-[#F5F3FF] text-[#5B3FD6]'
                  }`}>
                    <Layers3 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#2C2145] truncate">{domain.name}</span>
                      {selected && <CheckCircle2 className="w-4 h-4 text-[#5B3FD6] shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {domain.description || 'بدون وصف'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {domainStats.banks} بنك • {domainStats.questions} سؤال
                    </p>
                  </div>
                </div>
              </button>

              {!domain.builtIn && (
                <button
                  onClick={() => deleteDomain(domain.id)}
                  className="mt-3 w-full h-10 rounded-[12px] border border-red-100 text-red-600 text-xs font-bold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  إزالة المجال
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
