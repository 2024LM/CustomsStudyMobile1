package com.nexus.customsstudy;

import android.app.Activity;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.ads.IUnityAdsInitializationListener;
import com.unity3d.ads.IUnityAdsLoadListener;
import com.unity3d.ads.IUnityAdsShowListener;
import com.unity3d.ads.UnityAds;
import com.unity3d.ads.UnityAdsLoadOptions;
import com.unity3d.ads.UnityAdsShowOptions;
import com.unity3d.ads.metadata.MetaData;
import com.unity3d.services.banners.BannerView;
import com.unity3d.services.banners.BannerErrorInfo;
import com.unity3d.services.banners.UnityBannerSize;

@CapacitorPlugin(name = "NexusAds")
public class NexusAdsPlugin extends Plugin {
    private static final String GAME_ID = "800376558";
    private static final String BANNER_ID = "BP_Banner_Android";
    private boolean initialized = false;
    private BannerView bannerView;
    private FrameLayout bannerContainer;
    private PluginCall pendingBannerCall;

    @PluginMethod
    public void initializeAds(PluginCall call) {
        if (initialized) { call.resolve(); return; }
        boolean personalized = Boolean.TRUE.equals(call.getBoolean("personalized", false));
        Activity activity = getActivity();

        MetaData consent = new MetaData(activity);
        consent.set("gdpr.consent", personalized);
        consent.set("privacy.consent", personalized);
        consent.commit();

        UnityAds.initialize(activity.getApplicationContext(), GAME_ID, false,
            new IUnityAdsInitializationListener() {
                @Override public void onInitializationComplete() {
                    initialized = true;
                    call.resolve();
                }
                @Override public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
                    initialized = false;
                    call.resolve();
                }
            });
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        String placement = call.getString("placementId", "BP_Interstitial_Android");
        Activity activity = getActivity();
        if (!initialized) { call.resolve(); return; }

        UnityAds.load(placement, new UnityAdsLoadOptions(), new IUnityAdsLoadListener() {
            @Override public void onUnityAdsAdLoaded(String id) {
                UnityAds.show(activity, id, new UnityAdsShowOptions(), new IUnityAdsShowListener() {
                    @Override public void onUnityAdsShowFailure(String p, UnityAds.UnityAdsShowError e, String m) { call.resolve(); }
                    @Override public void onUnityAdsShowStart(String p) {}
                    @Override public void onUnityAdsShowClick(String p) {}
                    @Override public void onUnityAdsShowComplete(String p, UnityAds.UnityAdsShowCompletionState s) { call.resolve(); }
                });
            }
            @Override public void onUnityAdsFailedToLoad(String id, UnityAds.UnityAdsLoadError error, String message) { call.resolve(); }
        });
    }

    @PluginMethod
    public void showBanner(PluginCall call) {
        if (!initialized) { call.resolve(); return; }
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            hideBannerInternal();
            bannerContainer = new FrameLayout(activity);
            FrameLayout.LayoutParams containerParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                (int) (50 * activity.getResources().getDisplayMetrics().density)
            );
            containerParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            bannerContainer.setLayoutParams(containerParams);

            bannerView = new BannerView(activity, BANNER_ID, new UnityBannerSize(320, 50));
            pendingBannerCall = call;
            bannerView.setListener(new BannerView.IListener() {
                @Override public void onBannerLoaded(BannerView view) {
                    if (pendingBannerCall != null) {
                        JSObject result = new JSObject();
                        result.put("loaded", true);
                        pendingBannerCall.resolve(result);
                        pendingBannerCall = null;
                    }
                }
                @Override public void onBannerFailedToLoad(BannerView view, BannerErrorInfo errorInfo) {
                    hideBannerInternal();
                    if (pendingBannerCall != null) {
                        pendingBannerCall.reject("Banner failed to load: " + errorInfo.errorMessage);
                        pendingBannerCall = null;
                    }
                }
                @Override public void onBannerClick(BannerView view) {}
                @Override public void onBannerLeftApplication(BannerView view) {}
            });
            bannerContainer.addView(bannerView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER
            ));
            activity.addContentView(bannerContainer, containerParams);
            bannerView.load();
        });
    }

    @PluginMethod
    public void hideBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            hideBannerInternal();
            call.resolve();
        });
    }

    private void hideBannerInternal() {
        if (pendingBannerCall != null) {
            pendingBannerCall.resolve();
            pendingBannerCall = null;
        }
        if (bannerView != null) {
            bannerView.destroy();
            bannerView = null;
        }
        if (bannerContainer != null && bannerContainer.getParent() instanceof ViewGroup) {
            ((ViewGroup) bannerContainer.getParent()).removeView(bannerContainer);
        }
        bannerContainer = null;
    }

    @Override
    protected void handleOnDestroy() {
        hideBannerInternal();
        super.handleOnDestroy();
    }
}
