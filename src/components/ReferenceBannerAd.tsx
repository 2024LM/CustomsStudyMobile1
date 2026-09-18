import React, { useEffect, useRef } from 'react';

interface ReferenceBannerAdProps {
  slot: string;
}

/**
 * Stable host for the native Unity banner placement.
 * The native Capacitor bridge will attach BP_Banner_Android to this slot.
 * Keeping this component isolated prevents ad failures from affecting reference content.
 */
export const ReferenceBannerAd: React.FC<ReferenceBannerAdProps> = ({ slot }) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.adPlacement = 'BP_Banner_Android';
    host.dataset.adSlot = slot;
  }, [slot]);

  return (
    <div
      ref={hostRef}
      className="reference-banner-ad w-full min-h-[50px] rounded-[16px] overflow-hidden bg-white border border-gray-100 shadow-xs flex items-center justify-center"
      aria-label="إعلان"
    >
      <span className="text-[10px] text-gray-300 select-none">إعلان</span>
    </div>
  );
};
