import React, { useEffect } from 'react';
import { hideBanner, showBanner } from '../services/ads';

interface ReferenceBannerAdProps {
  slot: string;
}

export const ReferenceBannerAd: React.FC<ReferenceBannerAdProps> = ({ slot }) => {
  useEffect(() => {
    const activate = () => void showBanner(slot);
    activate();
    window.addEventListener('ads-consent-changed', activate);
    return () => {
      window.removeEventListener('ads-consent-changed', activate);
      void hideBanner();
    };
  }, [slot]);

  return (
    <div
      className="reference-banner-ad w-full min-h-[50px]"
      data-ad-placement="BP_Banner_Android"
      data-ad-slot={slot}
      aria-label="إعلان"
    />
  );
};
