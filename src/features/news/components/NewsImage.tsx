import React, { useEffect, useState } from 'react';

export function NewsImage({ url, featured = false, children }: { url?: string; featured?: boolean; children: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  let safeUrl: string | undefined;
  try { if (url && /^https?:$/.test(new URL(url).protocol)) safeUrl = url; } catch {}
  if (!safeUrl || failed) return <>{children}</>;
  return featured ? (
    <img src={safeUrl} alt="" decoding="async" referrerPolicy="no-referrer"
      className="absolute inset-0 w-full h-full object-cover" onError={() => setFailed(true)} />
  ) : (
    <div className="h-36 overflow-hidden bg-gray-100">
      <img src={safeUrl} alt="" decoding="async" referrerPolicy="no-referrer" loading="lazy"
        className="w-full h-full object-contain" onError={() => setFailed(true)} />
    </div>
  );
}
