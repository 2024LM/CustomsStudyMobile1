import React, { useEffect, useRef, useState } from 'react';

function PreparedImage({ url, featured, children }: { url: string; featured: boolean; children?: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(featured);
  const [phase, setPhase] = useState<'pending' | 'ready' | 'failed'>('pending');
  const phaseRef = useRef(phase);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (nearby) return;
    if (!('IntersectionObserver' in window)) { setNearby(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearby(true);
        observer.disconnect();
      }
    }, { rootMargin: '300px' });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [nearby]);
  const finish = (next: 'ready' | 'failed') => {
    if (!alive.current || phaseRef.current !== 'pending') return;
    phaseRef.current = next;
    setPhase(next);
  };
  useEffect(() => {
    if (!nearby || phase !== 'pending') return;
    const timer = window.setTimeout(() => {
      if (alive.current && phaseRef.current === 'pending') {
        phaseRef.current = 'failed';
        setPhase('failed');
      }
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [nearby, phase]);
  const loaded = async (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    try {
      // Keep this same element hidden until the bytes are decoded and usable.
      if (image.decode) await image.decode();
      if (image.naturalWidth < 80 || image.naturalHeight < 60) { finish('failed'); return; }
      finish('ready');
    } catch { finish('failed'); }
  };
  return (
    <div ref={host} data-news-image-state={phase}>
      {phase !== 'ready' && children}
      {nearby && phase !== 'failed' && (
        <img src={url} alt="" decoding="async" loading="eager" referrerPolicy="no-referrer"
          onLoad={event => void loaded(event)} onError={() => {
            phaseRef.current = 'failed';
            if (alive.current) setPhase('failed');
          }}
          style={{ display: phase === 'ready' ? 'block' : 'none' }}
          className={featured ? 'relative w-full max-h-64 object-contain bg-black/10' : 'w-full max-h-56 object-contain bg-gray-50'} />
      )}
    </div>
  );
}

export function NewsImage({ url, featured = false, children }: { url?: string; featured?: boolean; children?: React.ReactNode }) {
  let safeUrl: string | undefined;
  try { if (url && /^https?:$/.test(new URL(url).protocol)) safeUrl = url; } catch {}
  return safeUrl ? <PreparedImage key={safeUrl} url={safeUrl} featured={featured}>{children}</PreparedImage> : <>{children}</>;
}
