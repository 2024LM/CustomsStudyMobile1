const INTERSTITIAL_PLACEMENT = 'BP_Interstitial_Android';

declare global {
  interface Window {
    NexusAds?: {
      showInterstitial?: (placementId: string) => Promise<void>;
    };
  }
}

/**
 * Requests a full-screen Unity interstitial from the native bridge.
 * Ad availability must never block access to study content.
 */
export async function showInterstitial(): Promise<void> {
  try {
    const show = window.NexusAds?.showInterstitial;
    if (!show) return;
    await Promise.race([
      show(INTERSTITIAL_PLACEMENT),
      new Promise<void>((resolve) => window.setTimeout(resolve, 4500)),
    ]);
  } catch {
    // References remain accessible if the ad is unavailable or the native bridge fails.
  }
}

/** Backward-compatible reference entry point. */
export const showReferenceInterstitial = showInterstitial;
