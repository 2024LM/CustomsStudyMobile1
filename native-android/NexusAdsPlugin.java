package com.nexus.customsstudy;

import android.app.Activity;
import android.graphics.Rect;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.ads.*;
import com.unity3d.ads.metadata.MetaData;
import com.unity3d.services.banners.*;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.Map;

@CapacitorPlugin(name = "NexusAds")
public class NexusAdsPlugin extends Plugin {
    private static final String GAME_ID = "800376558";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, BannerState> banners = new HashMap<>();
    private boolean foreground = true;
    private PluginCall initializationCall;
    private Runnable initializationTimeout;
    private PluginCall interstitialCall;
    private Runnable interstitialTimeout;
    private boolean interstitialShowing;

    private static class BannerState {
        String slot;
        String placement;
        String fallbackPlacement;
        boolean rectangle;
        int adWidth;
        int adHeight;
        FrameLayout container;
        BannerView view;
        PluginCall pending;
        Runnable timeout;
        double x, y, width, height, viewportWidth, clipLeft, clipTop, clipRight, clipBottom;
        boolean visible;
    }

    private boolean online() {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    @PluginMethod
    public void initializeAds(PluginCall call) {
        handler.post(() -> {
            if (!foreground || !online()) { call.reject("Network unavailable"); return; }
            if (UnityAds.isInitialized()) { call.resolve(); return; }
            if (initializationCall != null) { call.reject("Ads initialization is in progress"); return; }
            initializationCall = call;
            initializationTimeout = () -> finishInitialization(false, "Ads initialization timed out");
            handler.postDelayed(initializationTimeout, 12000);
            MetaData consent = new MetaData(getActivity());
            consent.set("gdpr.consent", Boolean.TRUE.equals(call.getBoolean("personalized", false)));
            consent.set("privacy.consent", Boolean.TRUE.equals(call.getBoolean("personalized", false)));
            consent.commit();
            UnityAds.initialize(getContext().getApplicationContext(), GAME_ID, false,
                new IUnityAdsInitializationListener() {
                    @Override public void onInitializationComplete() {
                        handler.post(() -> finishInitialization(true, ""));
                    }
                    @Override public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
                        handler.post(() -> finishInitialization(false, message));
                    }
                });
        });
    }

    private void finishInitialization(boolean success, String message) {
        if (initializationTimeout != null) handler.removeCallbacks(initializationTimeout);
        PluginCall call = initializationCall;
        initializationCall = null;
        if (call != null) {
            if (success) call.resolve();
            else call.reject(message);
        }
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        handler.post(() -> {
            if (!foreground || !online() || !UnityAds.isInitialized() || interstitialCall != null) {
                call.resolve(); return;
            }
            String placement = call.getString("placementId", "BP_Interstitial_Android");
            interstitialCall = call;
            interstitialShowing = false;
            // Prevent a delayed load from displaying after navigation has resumed.
            interstitialTimeout = () -> finishInterstitial(call);
            handler.postDelayed(interstitialTimeout, 4500);
            UnityAds.load(placement, new UnityAdsLoadOptions(), new IUnityAdsLoadListener() {
                @Override public void onUnityAdsAdLoaded(String id) {
                    handler.post(() -> {
                        if (interstitialCall != call) return;
                        if (!foreground || !online()) { finishInterstitial(call); return; }
                        handler.removeCallbacks(interstitialTimeout);
                        interstitialShowing = true;
                        UnityAds.show(getActivity(), id, new UnityAdsShowOptions(), new IUnityAdsShowListener() {
                            @Override public void onUnityAdsShowFailure(String p, UnityAds.UnityAdsShowError error, String message) {
                                handler.post(() -> finishInterstitial(call));
                            }
                            @Override public void onUnityAdsShowStart(String p) {}
                            @Override public void onUnityAdsShowClick(String p) {}
                            @Override public void onUnityAdsShowComplete(String p, UnityAds.UnityAdsShowCompletionState state) {
                                handler.post(() -> finishInterstitial(call));
                            }
                        });
                    });
                }
                @Override public void onUnityAdsFailedToLoad(String id, UnityAds.UnityAdsLoadError error, String message) {
                    handler.post(() -> finishInterstitial(call));
                }
            });
        });
    }

    private void finishInterstitial(PluginCall expected) {
        if (interstitialCall != expected) return;
        if (interstitialTimeout != null) handler.removeCallbacks(interstitialTimeout);
        interstitialCall = null;
        interstitialShowing = false;
        expected.resolve();
    }

    @PluginMethod
    public void showBanner(PluginCall call) {
        handler.post(() -> {
            if (!foreground || !online() || !UnityAds.isInitialized()) { call.reject("Ads unavailable"); return; }
            String slot = call.getString("slot", "default");
            hideBannerInternal(slot);
            BannerState state = new BannerState();
            state.slot = slot;
            state.placement = call.getString("placementId", "BP_Banner_Android");
            state.fallbackPlacement = call.getString("fallbackPlacementId", "BP_Banner_Android");
            state.rectangle = "rectangle".equals(call.getString("format", "banner"));
            state.adWidth = state.rectangle ? 300 : 320;
            state.adHeight = state.rectangle ? 250 : 50;
            state.pending = call;
            state.container = new FrameLayout(getActivity());
            readPosition(state, call);
            banners.put(slot, state);
            getActivity().addContentView(state.container, new FrameLayout.LayoutParams(1, 1));
            loadBanner(state);
        });
    }

    private void fallbackBanner(BannerState state) {
        state.rectangle = false;
        state.placement = state.fallbackPlacement;
        state.adWidth = 320;
        state.adHeight = 50;
        state.container.removeView(state.view);
        state.view.destroy();
        loadBanner(state);
    }

    private void loadBanner(BannerState state) {
        if (state.timeout != null) handler.removeCallbacks(state.timeout);
        state.timeout = () -> {
            if (banners.get(state.slot) != state || state.pending == null) return;
            if (state.rectangle) { fallbackBanner(state); return; }
            PluginCall pending = state.pending;
            state.pending = null;
            hideBannerInternal(state.slot);
            android.util.Log.w("NexusAds", "Banner " + state.placement + " timed out");
            pending.reject("Banner load timed out");
        };
        handler.postDelayed(state.timeout, state.rectangle ? 8000 : 15000);
        BannerView view = new BannerView(getActivity(), state.placement, new UnityBannerSize(state.adWidth, state.adHeight));
        state.view = view;
        view.setListener(new BannerView.IListener() {
            @Override public void onBannerLoaded(BannerView loadedView) {
                handler.post(() -> {
                    if (banners.get(state.slot) != state || state.view != loadedView) return;
                    positionBanner(state);
                    if (state.timeout != null) handler.removeCallbacks(state.timeout);
                    if (state.pending != null) {
                        JSObject result = new JSObject();
                        result.put("loaded", true);
                        result.put("height", state.adHeight);
                        state.pending.resolve(result);
                        state.pending = null;
                    }
                });
            }
            @Override public void onBannerFailedToLoad(BannerView failedView, BannerErrorInfo errorInfo) {
                handler.post(() -> {
                    if (banners.get(state.slot) != state || state.view != failedView) return;
                    if (state.rectangle && state.pending != null) {
                        fallbackBanner(state);
                        return;
                    }
                    PluginCall pending = state.pending;
                    state.pending = null;
                    hideBannerInternal(state.slot);
                    android.util.Log.w("NexusAds", "Banner " + state.placement + ": " + errorInfo.errorMessage);
                    if (pending != null) pending.reject("Banner failed to load: " + errorInfo.errorMessage);
                    JSObject event = new JSObject();
                    event.put("slot", state.slot);
                    notifyListeners("banner-failed", event);
                });
            }
            @Override public void onBannerClick(BannerView view) {}
            @Override public void onBannerLeftApplication(BannerView view) {}
            @Override public void onBannerShown(BannerView view) {}
        });
        state.container.addView(view);
        positionBanner(state);
        view.load();
    }

    private void readPosition(BannerState state, PluginCall call) {
        state.x = call.getDouble("x", 0.0);
        state.y = call.getDouble("y", 0.0);
        state.width = call.getDouble("width", 320.0);
        state.height = call.getDouble("height", 50.0);
        state.viewportWidth = call.getDouble("viewportWidth", 0.0);
        state.clipLeft = call.getDouble("clipLeft", 0.0);
        state.clipTop = call.getDouble("clipTop", 0.0);
        state.clipRight = call.getDouble("clipRight", state.viewportWidth);
        state.clipBottom = call.getDouble("clipBottom", 100000.0);
        state.visible = Boolean.TRUE.equals(call.getBoolean("visible", false));
    }

    private void positionBanner(BannerState state) {
        View webView = getBridge().getWebView();
        Rect webRect = new Rect();
        Rect activityRect = new Rect();
        webView.getGlobalVisibleRect(webRect);
        getActivity().findViewById(android.R.id.content).getGlobalVisibleRect(activityRect);
        float scale = state.viewportWidth > 0 ? (float) (webRect.width() / state.viewportWidth)
            : getContext().getResources().getDisplayMetrics().density;
        int adWidth = Math.round(state.adWidth * scale);
        int adHeight = Math.round(state.adHeight * scale);
        int left = webRect.left + Math.round((float) (state.x + (state.width - state.adWidth) / 2) * scale);
        int top = webRect.top + Math.round((float) state.y * scale);
        int clipLeft = Math.max(left, webRect.left + Math.round((float) state.clipLeft * scale));
        int clipTop = Math.max(top, webRect.top + Math.round((float) state.clipTop * scale));
        int clipRight = Math.min(left + adWidth, Math.min(webRect.right, webRect.left + Math.round((float) state.clipRight * scale)));
        int clipBottom = Math.min(top + adHeight, Math.min(webRect.bottom, webRect.top + Math.round((float) state.clipBottom * scale)));
        FrameLayout.LayoutParams child = new FrameLayout.LayoutParams(adWidth, adHeight);
        child.leftMargin = left - clipLeft;
        child.topMargin = top - clipTop;
        state.view.setLayoutParams(child);
        boolean visible = foreground && state.visible && clipRight > clipLeft && clipBottom > clipTop;
        state.container.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
        if (!visible) {
            // Keep the SDK view measured while loading, without exposing an
            // overlay before React has allocated the successful ad's space.
            state.container.setLayoutParams(new FrameLayout.LayoutParams(adWidth, adHeight));
            return;
        }
        FrameLayout.LayoutParams container = new FrameLayout.LayoutParams(clipRight - clipLeft, clipBottom - clipTop);
        container.gravity = Gravity.TOP | Gravity.LEFT;
        container.leftMargin = clipLeft - activityRect.left;
        container.topMargin = clipTop - activityRect.top;
        state.container.setLayoutParams(container);
    }

    @PluginMethod
    public void updateBanner(PluginCall call) {
        handler.post(() -> {
            BannerState state = banners.get(call.getString("slot", "default"));
            if (state != null) { readPosition(state, call); positionBanner(state); }
            call.resolve();
        });
    }

    @PluginMethod
    public void hideBanner(PluginCall call) {
        handler.post(() -> { hideBannerInternal(call.getString("slot", "default")); call.resolve(); });
    }

    private void hideBannerInternal(String slot) {
        BannerState state = banners.remove(slot);
        if (state == null) return;
        if (state.timeout != null) handler.removeCallbacks(state.timeout);
        if (state.pending != null) {
            JSObject result = new JSObject();
            result.put("loaded", false);
            state.pending.resolve(result);
            state.pending = null;
        }
        if (state.view != null) state.view.destroy();
        if (state.container.getParent() instanceof ViewGroup) {
            ((ViewGroup) state.container.getParent()).removeView(state.container);
        }
    }

    @Override protected void handleOnStart() {
        foreground = true;
        super.handleOnStart();
        notifyListeners("ads-resumed", new JSObject());
    }

    @Override protected void handleOnStop() {
        foreground = false;
        for (String slot : new ArrayList<>(banners.keySet())) hideBannerInternal(slot);
        if (interstitialCall != null && !interstitialShowing) finishInterstitial(interstitialCall);
        super.handleOnStop();
    }

    @Override protected void handleOnDestroy() {
        foreground = false;
        for (String slot : new ArrayList<>(banners.keySet())) hideBannerInternal(slot);
        finishInitialization(false, "Activity destroyed");
        if (interstitialCall != null) finishInterstitial(interstitialCall);
        handler.removeCallbacksAndMessages(null);
        super.handleOnDestroy();
    }
}
