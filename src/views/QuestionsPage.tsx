import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { db } from '../services/db';
import { ScreenHeader } from '../components/ScreenHeader';
import { QuestionCard } from '../components/QuestionCard';

export const QuestionsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const total = useMemo(() => {
    return db.searchCount(db.activeBankId(), search);
  }, [search]);

  const questions = useMemo(() => {
    return db.questionPage(db.activeBankId(), search, null, pageSize, page * pageSize);
  }, [search, page]);

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
      <ScreenHeader title="الأسئلة" subtitle="ابحث وراجع بنك الأسئلة" />

      {/* Search Bar */}
      <div className="relative w-full">
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

      {/* Results Count Header */}
      <div className="flex items-center justify-between py-1">
        <span className="font-bold text-sm text-[#2C2145]">النتائج</span>
        <span className="bg-[#F5F3FF] text-[#5B3FD6] text-xs font-bold px-3 py-1.5 rounded-[20px]">
          {total} سؤال
        </span>
      </div>

      {/* Questions List */}
      <div className="flex flex-col gap-3">
        {questions.length === 0 ? (
          <div className="bg-white rounded-[20px] p-8 text-center text-gray-500 border border-gray-100 flex flex-col items-center gap-2">
            <span className="text-3xl">🔍</span>
            <p className="font-bold text-base text-[#2C2145]">لم يتم العثور على نتائج</p>
            <p className="text-xs text-gray-400">جرب البحث بكلمات أخرى أو اختر محورًا آخر</p>
          </div>
        ) : (
          questions.map((q) => <QuestionCard key={q.rowId} question={q} />)
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
