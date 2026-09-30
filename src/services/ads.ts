import { Capacitor, registerPlugin } from '@capacitor/core';

export type AdFormat = 'banner' | 'rectangle';
export interface AdRect {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  visible: boolean;
  clipLeft?: number;
  clipTop?: number;
  clipRight?: number;
  clipBottom?: number;
}
interface NexusAdsPlugin {
  initializeAds(options: { personalized: boolean }): Promise<void>;
  showInterstitial(options: { placementId: string }): Promise<void>;
  showBanner(options: AdRect & { placementId: string; slot: string; format: AdFormat }): Promise<{ loaded?: boolean; height?: number }>;
  updateBanner(options: AdRect & { slot: string }): Promise<void>;
  hideBanner(options: { slot: string }): Promise<void>;
}
const NexusAds = registerPlugin<NexusAdsPlugin>('NexusAds');
const BANNER_PLACEMENT = import.meta.env.VITE_UNITY_BANNER_PLACEMENT || 'BP_Banner_Android';
const RECTANGLE_PLACEMENT = import.meta.env.VITE_UNITY_RECTANGLE_PLACEMENT || BANNER_PLACEMENT;
let initialized = false;
let initialization: Promise<boolean> | null = null;
let interstitial: Promise<void> | null = null;

export function adsAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && navigator.onLine && document.visibilityState === 'visible';
}

async function ensureInitialized(): Promise<boolean> {
  if (!adsAvailable()) return false;
  if (initialized) return true;
  if (!initialization) {
    initialization = NexusAds.initializeAds({ personalized: false })
      .then(() => { initialized = true; return true; })
      .catch(() => false)
      .finally(() => { initialization = null; });
  }
  return initialization;
}

export function showInterstitial(): Promise<void> {
  if (!adsAvailable()) return Promise.resolve();
  if (interstitial) return interstitial;
  interstitial = (async () => {
    if (await ensureInitialized() && adsAvailable()) {
      await NexusAds.showInterstitial({ placementId: 'BP_Interstitial_Android' });
    }
  })().catch(() => undefined).finally(() => { interstitial = null; });
  return interstitial;
}

export async function showBanner(slot: string, rect: AdRect, format: AdFormat): Promise<{ loaded: boolean; height: number }> {
  try {
    if (!(await ensureInitialized()) || !adsAvailable()) return { loaded: false, height: 0 };
    const result = await NexusAds.showBanner({
      placementId: format === 'rectangle' ? RECTANGLE_PLACEMENT : BANNER_PLACEMENT,
      slot, format, ...rect,
    });
    return { loaded: result?.loaded === true, height: result?.height || (format === 'rectangle' ? 250 : 50) };
  } catch {
    return { loaded: false, height: 0 };
  }
}
export async function updateBanner(slot: string, rect: AdRect): Promise<void> {
  try { await NexusAds.updateBanner({ slot, ...rect }); } catch {}
}
export async function hideBanner(slot: string): Promise<void> {
  try { await NexusAds.hideBanner({ slot }); } catch {}
}
export const showReferenceInterstitial = showInterstitial;
