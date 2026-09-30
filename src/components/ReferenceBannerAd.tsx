import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdFormat, adsAvailable, hideBanner, onAdsResumed, showBanner, updateBanner } from '../services/ads';

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
    let lastPosition = '';
    let failures = 0;
    let generation = 0;
    const host = hostRef.current;
    if (!host) return;

    const rect = () => {
      const box = host.getBoundingClientRect();
      let clipLeft = 0, clipTop = 0, clipRight = window.innerWidth, clipBottom = window.innerHeight;
      for (let parent = host.parentElement; parent; parent = parent.parentElement) {
        const style = window.getComputedStyle(parent);
        const bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          clipTop = Math.max(clipTop, bounds.top);
          clipBottom = Math.min(clipBottom, bounds.bottom);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          clipLeft = Math.max(clipLeft, bounds.left);
          clipRight = Math.min(clipRight, bounds.right);
        }
      }
      const navigation = document.querySelector('[data-tour="bottom-navigation"]');
      if (navigation) clipBottom = Math.min(clipBottom, navigation.getBoundingClientRect().top);
      const top = Math.max(box.top, clipTop), bottom = Math.min(box.bottom, clipBottom);
      const left = Math.max(box.left, clipLeft), right = Math.min(box.right, clipRight);
      const hit = bottom > top && right > left ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2) : null;
      return {
        x: box.left, y: box.top, width: box.width, height: box.height,
        viewportWidth: window.innerWidth,
        visible: adsAvailable() && !!hit && (hit === host || host.contains(hit)),
        clipLeft, clipTop, clipRight, clipBottom,
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
      if (active && hasAd) {
        const bounds = rect();
        const signature = bounds.visible ? JSON.stringify(bounds) : 'hidden';
        if (signature === lastPosition) return;
        lastPosition = signature;
        void updateBanner(adSlot, bounds);
      }
    };
    const schedulePosition = () => {
      if (!frame) frame = window.setTimeout(position, 80);
    };
    const reset = () => {
      generation += 1;
      hasAd = false;
      lastPosition = '';
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
    const resumed = onAdsResumed(() => {
      if (!active) return;
      reset();
      failures = 0;
      void activate();
    }).catch(() => null);
    const observer = new IntersectionObserver((entries) => {
      near = entries.some(entry => entry.isIntersecting);
      if (near) void activate();
      else clearRetry();
      schedulePosition();
    }, { threshold: 0 });
    observer.observe(host);
    const resize = new ResizeObserver(schedulePosition);
    resize.observe(host);
    // Native overlays must not cover web dialogs or navigation.
    const mutations = new MutationObserver(schedulePosition);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('scroll', schedulePosition, true);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      generation += 1;
      clearRetry();
      window.clearTimeout(frame);
      void resumed.then(listener => listener?.remove());
      observer.disconnect();
      resize.disconnect();
      mutations.disconnect();
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
