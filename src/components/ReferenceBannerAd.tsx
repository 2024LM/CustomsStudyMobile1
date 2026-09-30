import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdFormat, adsAvailable, hideBanner, onAdsResumed, onBannerFailed, showBanner, updateBanner } from '../services/ads';

interface ReferenceBannerAdProps { slot: string; format?: AdFormat; className?: string; }

export const ReferenceBannerAd: React.FC<ReferenceBannerAdProps> = ({ slot, format = 'rectangle', className = '' }) => {
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
    let retryAt = 0;
    let frame = 0;
    let lastPosition = '';
    let failures = 0;
    let generation = 0;
    const host = hostRef.current;
    if (!host) return;
    // A hidden slot takes no layout space. Observe nearby content to keep retrying
    // when it becomes visible, rather than relying on a zero-sized ad host.
    const anchor = host.previousElementSibling || host.nextElementSibling || host.parentElement;
    if (!anchor) return;

    const rect = () => {
      const box = host.getBoundingClientRect();
      if (!hasAd || !box.height) {
        const parent = host.parentElement?.getBoundingClientRect();
        const nearby = anchor.getBoundingClientRect();
        return {
          x: parent?.left || 0, y: nearby.bottom, width: parent?.width || window.innerWidth,
          height: 0, viewportWidth: window.innerWidth, visible: false,
          clipLeft: 0, clipTop: 0, clipRight: window.innerWidth, clipBottom: window.innerHeight,
        };
      }
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
    const clearRetry = () => { window.clearTimeout(retry); retry = undefined; retryAt = 0; };
    const retryLater = () => {
      failures += 1;
      const delay = Math.min(300000, 15000 * 2 ** Math.min(failures - 1, 5));
      retryAt = Date.now() + delay;
      retry = window.setTimeout(() => {
        retry = undefined;
        retryAt = 0;
        void activate();
      }, delay);
    };
    const activate = async () => {
      if (!active || !near || loading || hasAd || Date.now() < retryAt || !adsAvailable()) return;
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
        retryLater();
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
      else { failures = 0; clearRetry(); void activate(); }
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
    const failed = onBannerFailed(adSlot, () => {
      // Initial failures are handled by the loading promise. This covers SDK
      // refresh failures after a banner has already been displayed.
      if (!active || !hasAd) return;
      reset();
      retryLater();
    }).catch(() => null);
    const intersections = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) intersections.set(entry.target, entry.isIntersecting);
      near = [...intersections.values()].some(Boolean);
      if (near) void activate();
      schedulePosition();
    }, { threshold: 0, rootMargin: '120px 0px' });
    observer.observe(anchor);
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
      void failed.then(listener => listener?.remove());
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
    className={`reference-banner-ad w-full ${className}`}
    style={{ display: native && online && loaded ? 'block' : 'none', height: loaded ? height : 0 }}
    data-ad-format={format}
    data-ad-slot={slot}
    data-ad-loaded={loaded}
    aria-label="إعلان"
  />;
};
