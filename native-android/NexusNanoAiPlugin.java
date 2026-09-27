package com.nexus.customsstudy;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NexusNanoAi")
public class NexusNanoAiPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private GenerativeModelFutures model() {
        return GenerativeModelFutures.from(Generation.INSTANCE.getClient());
    }

    private String statusName(int status) {
        if (status == FeatureStatus.AVAILABLE) return "available";
        if (status == FeatureStatus.DOWNLOADABLE) return "downloadable";
        if (status == FeatureStatus.DOWNLOADING) return "downloading";
        return "unavailable";
    }

    @PluginMethod
    public void status(PluginCall call) {
        executor.execute(() -> {
            try {
                GenerativeModelFutures model = model();
                int status = model.checkStatus().get();
                JSObject result = new JSObject();
                result.put("status", statusName(status));
                result.put("available", status == FeatureStatus.AVAILABLE);
                if (status == FeatureStatus.AVAILABLE) {
                    try {
                        result.put("model", model.getBaseModelName().get());
                        result.put("tokenLimit", model.getTokenLimit().get());
                    } catch (Exception ignored) {}
                }
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Unable to check Gemini Nano availability", e);
            }
        });
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String prompt = call.getString("prompt", "").trim();
        if (prompt.isEmpty()) {
            call.reject("Prompt is empty");
            return;
        }

        executor.execute(() -> {
            try {
                GenerativeModelFutures model = model();
                int status = model.checkStatus().get();
                if (status != FeatureStatus.AVAILABLE) {
                    JSObject unavailable = new JSObject();
                    unavailable.put("status", statusName(status));
                    unavailable.put("text", "");
                    call.resolve(unavailable);
                    return;
                }

                GenerateContentResponse response = model.generateContent(prompt).get();
                String text = "";
                if (response != null && !response.getCandidates().isEmpty()) {
                    String candidateText = response.getCandidates().get(0).getText();
                    if (candidateText != null) text = candidateText.trim();
                }

                JSObject result = new JSObject();
                result.put("status", "available");
                result.put("text", text);
                try { result.put("model", model.getBaseModelName().get()); } catch (Exception ignored) {}
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Gemini Nano inference failed", e);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
