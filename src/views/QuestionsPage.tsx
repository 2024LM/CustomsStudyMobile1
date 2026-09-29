import React, { useState, useMemo } from 'react';
import { Search, X, SlidersHorizontal, BookOpen, Rows3, ListTree } from 'lucide-react';
import { db } from '../services/db';
import { QuestionCard } from '../components/QuestionCard';

interface QuestionsPageProps {
  embedded?: boolean;
}

export const QuestionsPage: React.FC<QuestionsPageProps> = ({ embedded = false }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'QCM' | 'TRUE_FALSE' | 'OPEN' | 'ORAL'>('ALL');
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const topics = useMemo(() => Array.from(new Set(db.questions(db.activeBankId()).map((q) => q.topic.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar')), []);
  const pageSize = 50;

  const total = useMemo(() => {
    return db.searchCount(
      db.activeBankId(),
      search,
      selectedTopic === 'ALL' ? null : selectedTopic,
      selectedType === 'ALL' ? null : selectedType
    );
  }, [search, selectedTopic, selectedType]);

  const questions = useMemo(() => {
    return db.questionPage(
      db.activeBankId(),
      search,
      selectedTopic === 'ALL' ? null : selectedTopic,
      pageSize,
      page * pageSize,
      selectedType === 'ALL' ? null : selectedType
    );
  }, [search, page, selectedTopic, selectedType]);

  const totalPages = Math.ceil(total / pageSize);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const clearSearch = () => {
    setSearch('');
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-3 pb-8 text-right">
      {!embedded && (
        <div className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-lg">الأسئلة</h1>
              <p className="text-xs text-[#DDD5FF] mt-0.5">ابحث وراجع محتوى بنك الأسئلة بسهولة</p>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div data-tour="questions-search" className="relative w-full">
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="البحث في الأسئلة والمحاور..."
          className="w-full bg-white rounded-[18px] py-3.5 pr-11 pl-10 border border-[#E6E2F0] focus:border-[#5B3FD6] focus:outline-hidden text-sm text-[#2C2145] placeholder-gray-400 transition-colors shadow-xs"
        />
        <Search className="w-5 h-5 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        {search && (
          <button
            onClick={clearSearch}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Question type filter */}
      <div data-tour="questions-filter" className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          ['ALL', 'كل الأنواع'],
          ['QCM', 'اختيار متعدد'],
          ['TRUE_FALSE', 'صح / خطأ'],
          ['OPEN', 'مفتوح'],
          ['ORAL', 'شفهي'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setSelectedType(value as 'ALL' | 'QCM' | 'TRUE_FALSE' | 'OPEN' | 'ORAL');
              setPage(0);
            }}
            className={`shrink-0 px-3.5 py-2 rounded-[12px] text-xs font-bold border transition-colors ${
              selectedType === value
                ? 'bg-[#5B3FD6] text-white border-[#5B3FD6]'
                : 'bg-white text-gray-600 border-[#E6E2F0]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Topic filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="w-9 h-9 rounded-[12px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center shrink-0">
          <SlidersHorizontal className="w-4 h-4" />
        </div>
        {[['ALL', 'الكل'], ...topics.map((topic) => [topic, topic])].map(([value, label]) => (
          <button
            key={value}
            onClick={() => { setSelectedTopic(value); setPage(0); }}
            className={`shrink-0 px-3.5 py-2 rounded-[12px] text-xs font-bold border transition-colors ${
              selectedTopic === value
                ? 'bg-[#5B3FD6] text-white border-[#5B3FD6]'
                : 'bg-white text-gray-600 border-[#E6E2F0]'
            }`}
          >
            {label}
          </button>
        ))}      </div>

      {/* Results Count + view mode */}
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-[#2C2145]">النتائج</span>
          <span className="bg-[#F5F3FF] text-[#5B3FD6] text-[11px] font-bold px-2.5 py-1 rounded-full">
            {total} سؤال
          </span>
        </div>

        <div className="flex bg-white border border-gray-100 rounded-[12px] p-1 shadow-xs">
          <button
            onClick={() => setViewMode('compact')}
            className={`h-8 px-2.5 rounded-[9px] text-[10px] font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'compact'
                ? 'bg-[#F5F3FF] text-[#5B3FD6]'
                : 'text-gray-400'
            }`}
          >
            <Rows3 className="w-3.5 h-3.5" />
            مضغوط
          </button>
          <button
            onClick={() => setViewMode('detailed')}
            className={`h-8 px-2.5 rounded-[9px] text-[10px] font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'detailed'
                ? 'bg-[#F5F3FF] text-[#5B3FD6]'
                : 'text-gray-400'
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            مفصل
          </button>
        </div>
      </div>

      {/* Questions List */}
      <div data-tour="questions-list" className="overflow-hidden rounded-[18px] border border-gray-100 bg-white divide-y divide-gray-100">
        {questions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-2">
            <span className="text-3xl">🔍</span>
            <p className="font-bold text-base text-[#2C2145]">لم يتم العثور على نتائج</p>
            <p className="text-xs text-gray-400">جرب البحث بكلمات أخرى أو اختر محورًا آخر</p>
          </div>
        ) : (
          questions.map((q, index) => (
            <QuestionCard
              key={q.rowId}
              question={q}
              index={page * pageSize + index + 1}
              expandedByDefault={viewMode === 'detailed'}
            />
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {total > pageSize && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            className={`py-2 px-4 rounded-[14px] border text-xs font-bold transition-all ${
              page > 0
                ? 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 active:scale-95'
                : 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
            }`}
          >
            السابق
          </button>

          <span className="text-xs font-bold text-gray-600">
            {page + 1} / {totalPages || 1}
          </span>

          <button
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
            className={`py-2 px-4 rounded-[14px] text-xs font-bold transition-all ${
              (page + 1) * pageSize < total
                ? 'bg-[#5B3FD6] text-white hover:bg-[#4C33B8] active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
};
