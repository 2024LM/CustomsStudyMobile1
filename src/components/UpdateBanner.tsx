import React from 'react';
import { RemoteState } from '../types';
import { openUpdate } from '../services/remoteConfig';

interface UpdateBannerProps {
  remote: RemoteState;
}

const CURRENT_VERSION_CODE = 1;

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ remote }) => {
  const isUnsupported = CURRENT_VERSION_CODE < remote.minimum;
  const isUpdateAvailable = CURRENT_VERSION_CODE < remote.latest;

  if (isUnsupported) {
    return (
      <div className="bg-[#FFE8E8] text-[#C62828] border-b border-[#FFCDD2] px-4 py-3 flex items-center justify-between gap-3 text-right">
        <div className="flex flex-col">
          <span className="font-bold text-sm">
            {remote.updateTitle || 'يجب تحديث التطبيق'}
          </span>
          <span className="text-xs text-red-800">
            {remote.updateMessage || 'هذا الإصدار لم يعد مدعومًا.'}
          </span>
        </div>
        {remote.updateUrl && (
          <button
            onClick={() => openUpdate(remote.updateUrl)}
            className="shrink-0 bg-[#C62828] hover:bg-[#B71C1C] text-white text-xs font-bold py-2 px-3.5 rounded-[12px] transition-colors shadow-xs"
          >
            تحديث
          </button>
        )}
      </div>
    );
  }

  if (isUpdateAvailable) {
    return (
      <div className="bg-[#F5F3FF] text-[#5B3FD6] border-b border-[#E9E3FC] px-4 py-3 flex items-center justify-between gap-3 text-right">
        <div className="flex flex-col">
          <span className="font-bold text-sm">
            {remote.updateTitle || 'يتوفر تحديث جديد'}
          </span>
          <span className="text-xs text-[#6B51E0]">
            {remote.updateMessage || 'يتوفر إصدار أحدث من التطبيق.'}
          </span>
        </div>
        {remote.updateUrl && (
          <button
            onClick={() => openUpdate(remote.updateUrl)}
            className="shrink-0 bg-[#5B3FD6] hover:bg-[#4C33B8] text-white text-xs font-bold py-2 px-3.5 rounded-[12px] transition-colors shadow-xs"
          >
            تحديث
          </button>
        )}
      </div>
    );
  }

  return null;
};
