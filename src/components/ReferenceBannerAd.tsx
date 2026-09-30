import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdFormat, adsAvailable, hideBanner, showBanner, updateBanner } from '../services/ads';

interface ReferenceBannerAdProps { slot: string; format?: AdFormat; }

export const ReferenceBannerAd: React.FC<ReferenceBannerAdProps> = ({ slot, format = 'rectangle' }) => {
  const native = Capacitor.getPlatform() === 'android';
  const requestedHeight = format === 'rectangle' ? 250 : 50;
  const [online, setOnline] = useState(() => navigator.onLine);
  const [height, setHeight] = useState(requestedHeight);
  const [loaded, setLoaded] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const instance = useRef(slot + '-' + Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!native) return;
    const adSlot = instance.current;
    let active = true;
    let near = false;
    let loading = false;
    let hasAd = false;
    let retry: number | undefined;
    let frame = 0;
    let failures = 0;
    let generation = 0;
    const host = hostRef.current;
    if (!host) return;

    const rect = () => {
      const box = host.getBoundingClientRect();
      // Convert CSS pixels to physical pixels in the native bridge.
      return {
        x: box.left, y: box.top, width: box.width, height: box.height,
        viewportWidth: window.innerWidth,
        visible: adsAvailable() && box.bottom > 0 && box.top < window.innerHeight,
      };
    };
    const clearRetry = () => { window.clearTimeout(retry); retry = undefined; };
    const activate = async () => {
      if (!active || !near || loading || hasAd || !adsAvailable()) return;
      clearRetry();
      loading = true;
      const token = generation;
      const result = await showBanner(adSlot, rect(), format);
      if (!active || token !== generation) {
        await hideBanner(adSlot);
        loading = false;
        if (active) void activate();
        return;
      }
      loading = false;
      hasAd = result.loaded;
      setLoaded(hasAd);
      if (hasAd) {
        failures = 0;
        setHeight(result.height);
        schedulePosition();
      } else {
        failures += 1;
        // Retry no-fill/network failures only while a slot is on screen.
        retry = window.setTimeout(() => { retry = undefined; void activate(); }, Math.min(300000, 15000 * 2 ** Math.min(failures - 1, 5)));
      }
    };
    const position = () => {
      frame = 0;
      if (active && hasAd) void updateBanner(adSlot, rect());
    };
    const schedulePosition = () => {
      if (!frame) frame = window.requestAnimationFrame(position);
    };
    const reset = () => {
      generation += 1;
      hasAd = false;
      setLoaded(false);
      clearRetry();
      void hideBanner(adSlot);
    };
    const connectivity = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) reset();
      else { failures = 0; void activate(); }
    };
    const visibility = () => {
      if (document.visibilityState !== 'visible') reset();
      else { failures = 0; void activate(); schedulePosition(); }
    };
    const observer = new IntersectionObserver((entries) => {
      near = entries.some(entry => entry.isIntersecting);
      if (near) void activate();
      else clearRetry();
      schedulePosition();
    }, { threshold: 0 });
    observer.observe(host);
    const resize = new ResizeObserver(schedulePosition);
    resize.observe(host);
    window.addEventListener('scroll', schedulePosition, true);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      generation += 1;
      clearRetry();
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', schedulePosition, true);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      document.removeEventListener('visibilitychange', visibility);
      void hideBanner(adSlot);
    };
  }, [slot, format, native]);

  return <div
    ref={hostRef}
    className="reference-banner-ad w-full"
    style={{ height: native && online ? height : 0 }}
    data-ad-format={format}
    data-ad-slot={slot}
    data-ad-loaded={loaded}
    aria-label="إعلان"
  />;
};
