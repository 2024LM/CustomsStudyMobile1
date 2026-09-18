import React from 'react';
import { db } from '../services/db';
import { RemoteState } from '../types';
import { ArabicText } from './ArabicText';

interface AnnouncementModalProps {
  remote: RemoteState;
  onClose: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  remote,
  onClose,
}) => {
  const handleConfirm = () => {
    db.markAnnouncementSeen(remote.announcementId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-[24px] max-w-sm w-full p-6 shadow-xl border border-gray-100 flex flex-col gap-4 text-right">
        <h2 className="text-xl font-bold text-[#2C2145]">
          {remote.announcementTitle || 'إعلان'}
        </h2>
        <div className="text-sm text-gray-700 leading-relaxed max-h-60 overflow-y-auto">
          <ArabicText value={remote.announcementMessage} as="p" />
        </div>
        <button
          onClick={handleConfirm}
          className="w-full mt-2 py-3 px-4 rounded-[14px] bg-[#5B3FD6] text-white font-bold text-sm hover:bg-[#4C33B8] transition-colors shadow-xs active:scale-98"
        >
          حسنًا
        </button>
      </div>
    </div>
  );
};
