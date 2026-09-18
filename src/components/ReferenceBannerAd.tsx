import React, { useEffect, useState } from 'react';
import { hideBanner, showBanner } from '../services/ads';

interface ReferenceBannerAdProps {
  slot: string;
}

export const ReferenceBannerAd: React.FC<ReferenceBannerAdProps> = ({ slot }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    const activate = async () => {
      const loaded = await showBanner(slot);
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
      className={`reference-banner-ad w-full ${visible ? 'min-h-[50px]' : 'h-0 overflow-hidden'}`}
      data-ad-placement="BP_Banner_Android"
      data-ad-slot={slot}
      aria-label="إعلان"
    />
  );
};
