package com.nexus.customsstudy;

import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(name = "NexusTts")
public class NexusTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean ready = false;
    private Locale activeLocale = null;
    private Voice activeVoice = null;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (!ready) return;
        tts.setSpeechRate(0.92f);
        tts.setPitch(1.0f);
        selectBestArabicVoice();
    }

    private void selectBestArabicVoice() {
        if (!ready || tts == null) return;

        Locale[] preferred = new Locale[] {
            new Locale("ar", "MA"),
            new Locale("ar", "SA"),
            new Locale("ar", "EG"),
            new Locale("ar")
        };

        for (Locale locale : preferred) {
            int availability = tts.isLanguageAvailable(locale);
            if (availability >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(locale);
                activeLocale = locale;
                break;
            }
        }

        try {
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                Voice best = null;
                for (Voice voice : voices) {
                    Locale locale = voice.getLocale();
                    if (locale == null || !"ar".equalsIgnoreCase(locale.getLanguage())) continue;
                    if (best == null) best = voice;
                    if ("MA".equalsIgnoreCase(locale.getCountry())) {
                        best = voice;
                        break;
                    }
                }
                if (best != null) {
                    tts.setVoice(best);
                    activeVoice = best;
                    activeLocale = best.getLocale();
                }
            }
        } catch (Exception ignored) {}
    }

    private Voice findVoice(String name) {
        if (!ready || tts == null || name == null || name.trim().isEmpty()) return null;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null) return null;
            for (Voice voice : voices) {
                if (name.equals(voice.getName())) return voice;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private void applyVoice(Voice voice) {
        if (voice == null || tts == null) return;
        tts.setVoice(voice);
        activeVoice = voice;
        activeLocale = voice.getLocale();
    }

    @PluginMethod
    public void voices(PluginCall call) {
        JSObject result = new JSObject();
        JSArray output = new JSArray();

        if (!ready || tts == null) {
            result.put("ready", false);
            result.put("voices", output);
            call.resolve(result);
            return;
        }

        try {
            Set<Voice> voiceSet = tts.getVoices();
            List<Voice> voices = new ArrayList<>();
            if (voiceSet != null) voices.addAll(voiceSet);
            voices.sort(Comparator
                .comparing((Voice v) -> v.getLocale() != null ? v.getLocale().toLanguageTag() : "")
                .thenComparing(Voice::getName));

            for (Voice voice : voices) {
                JSObject item = new JSObject();
                Locale locale = voice.getLocale();
                String tag = locale != null ? locale.toLanguageTag() : "";
                item.put("name", voice.getName());
                item.put("locale", tag);
                item.put("language", locale != null ? locale.getLanguage() : "");
                item.put("country", locale != null ? locale.getCountry() : "");
                item.put("networkRequired", voice.isNetworkConnectionRequired());
                item.put("quality", voice.getQuality());
                item.put("latency", voice.getLatency());
                output.put(item);
            }

            result.put("ready", true);
            result.put("voices", output);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Unable to list TTS voices", e);
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ready", ready);
        result.put("arabic", activeLocale != null && "ar".equalsIgnoreCase(activeLocale.getLanguage()));
        result.put("locale", activeLocale != null ? activeLocale.toLanguageTag() : "");
        result.put("voice", activeVoice != null ? activeVoice.getName() : "");
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!ready || tts == null) {
            call.reject("TTS engine is not ready");
            return;
        }

        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.reject("Missing text");
            return;
        }

        String requestedVoice = call.getString("voice", "");
        Voice selected = findVoice(requestedVoice);
        if (selected != null) {
            applyVoice(selected);
        } else if (activeVoice == null) {
            selectBestArabicVoice();
        }

        Double rate = call.getDouble("rate", 0.92);
        float safeRate = (float)Math.max(0.5, Math.min(rate != null ? rate : 0.92, 1.5));
        tts.setSpeechRate(safeRate);

        String utteranceId = "nexus_" + System.currentTimeMillis();
        int speakResult = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        if (speakResult == TextToSpeech.ERROR) {
            call.reject("Unable to speak text");
            return;
        }

        JSObject response = new JSObject();
        response.put("started", true);
        response.put("locale", activeLocale != null ? activeLocale.toLanguageTag() : "");
        response.put("voice", activeVoice != null ? activeVoice.getName() : "");
        call.resolve(response);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        super.handleOnDestroy();
    }
}
