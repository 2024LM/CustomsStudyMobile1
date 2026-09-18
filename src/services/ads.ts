import { registerPlugin } from '@capacitor/core';

const INTERSTITIAL_PLACEMENT = 'BP_Interstitial_Android';

interface NexusAdsPlugin {
  initializeAds(options: { personalized: boolean }): Promise<void>;
  showInterstitial(options: { placementId: string }): Promise<void>;
  showBanner(options: { placementId: string; slot?: string; x: number; y: number; width: number; height: number }): Promise<{ loaded?: boolean } | void>;
  hideBanner(): Promise<void>;
}

const NexusAds = registerPlugin<NexusAdsPlugin>('NexusAds');
let initialized = false;

async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  try {
    await NexusAds.initializeAds({ personalized: false });
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

export async function showInterstitial(): Promise<void> {
  try {
    if (!(await ensureInitialized())) return;
    await Promise.race([
      NexusAds.showInterstitial({ placementId: INTERSTITIAL_PLACEMENT }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 4500)),
    ]);
  } catch {
    // Ads never block access to app content.
  }
}

export async function showBanner(slot: string | undefined, rect: { x: number; y: number; width: number; height: number }): Promise<boolean> {
  try {
    if (!(await ensureInitialized())) return false;
    const result = await NexusAds.showBanner({ placementId: 'BP_Banner_Android', slot, ...rect });
    return result?.loaded === true;
  } catch {
    return false;
  }
}

export async function hideBanner(): Promise<void> {
  try {
    await NexusAds.hideBanner();
  } catch {
    // no-op
  }
}

export const showReferenceInterstitial = showInterstitial;
