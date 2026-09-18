import React, { useEffect, useRef, useState } from 'react';
import { hideBanner, showBanner } from '../services/ads';

interface ReferenceBannerAdProps {
  slot: string;
}

export const ReferenceBannerAd: React.FC<ReferenceBannerAdProps> = ({ slot }) => {
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const activate = async () => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const loaded = await showBanner(slot, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: 50,
      });
      if (active) setVisible(loaded);
    };
    void activate();
    window.addEventListener('ads-consent-changed', activate);
    return () => {
      active = false;
      window.removeEventListener('ads-consent-changed', activate);
      void hideBanner();
    };
  }, [slot]);

  return (
    <div
      ref={hostRef}
      className={`reference-banner-ad w-full ${visible ? 'min-h-[50px]' : 'h-0 overflow-hidden'}`}
      data-ad-placement="BP_Banner_Android"
      data-ad-slot={slot}
      aria-label="إعلان"
    />
  );
};
