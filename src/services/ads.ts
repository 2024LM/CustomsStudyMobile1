import { registerPlugin } from '@capacitor/core';

const INTERSTITIAL_PLACEMENT = 'BP_Interstitial_Android';

interface NexusAdsPlugin {
  showInterstitial(options: { placementId: string }): Promise<void>;
  showBanner(options: { placementId: string; slot?: string }): Promise<void>;
  hideBanner(): Promise<void>;
}

const NexusAds = registerPlugin<NexusAdsPlugin>('NexusAds');

export async function showInterstitial(): Promise<void> {
  try {
    await Promise.race([
      NexusAds.showInterstitial({ placementId: INTERSTITIAL_PLACEMENT }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 4500)),
    ]);
  } catch {
    // Ads never block access to app content.
  }
}

export async function showBanner(slot?: string): Promise<void> {
  try {
    await NexusAds.showBanner({ placementId: 'BP_Banner_Android', slot });
  } catch {
    // Banner availability must not affect the screen.
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
