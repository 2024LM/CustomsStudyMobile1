package com.nexus.customsstudy;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.nl.languageid.LanguageIdentification;
import com.google.mlkit.nl.languageid.LanguageIdentificationOptions;
import com.google.mlkit.nl.languageid.LanguageIdentifier;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;

@CapacitorPlugin(name = "NexusNewsTranslate")
public class NexusNewsTranslatePlugin extends Plugin {
    private LanguageIdentifier identifier;

    private Task<String> translatePart(String text) {
        if (text.trim().isEmpty() || !text.matches("(?s).*\\p{L}.*")) return Tasks.forResult(text);
        if (identifier == null) return Tasks.forException(new IllegalStateException("الترجمة غير جاهزة."));
        return identifier.identifyLanguage(text).continueWithTask(identified -> {
            if (!identified.isSuccessful()) throw new IllegalStateException("تعذر تحديد لغة الخبر.", identified.getException());
            String language = identified.getResult();
            if ("ar".equals(language)) return Tasks.forResult(text);
            String source = TranslateLanguage.fromLanguageTag(language);
            if (source == null || "und".equals(language)) {
                // Keep isolated acronyms rather than guessing a language.
                if (text.matches("[A-Z0-9\\s.,:/%_-]{1,16}")) return Tasks.forResult(text);
                return Tasks.forException(new IllegalArgumentException("لغة هذا النص غير مدعومة للترجمة المحلية."));
            }
            Translator translator = Translation.getClient(new TranslatorOptions.Builder()
                .setSourceLanguage(source).setTargetLanguage(TranslateLanguage.ARABIC).build());
            Task<String> task = translator.downloadModelIfNeeded(new DownloadConditions.Builder().build())
                .continueWithTask(downloaded -> {
                    if (!downloaded.isSuccessful()) throw new IllegalStateException(
                        "تعذر تنزيل حزمة الترجمة. تحقق من الإنترنت ثم أعد المحاولة.", downloaded.getException());
                    return translator.translate(text);
                });
            task.addOnCompleteListener(ignored -> translator.close());
            return task;
        });
    }

    @PluginMethod public void translate(PluginCall call) {
        if (identifier == null) identifier = LanguageIdentification.getClient(
            new LanguageIdentificationOptions.Builder().setConfidenceThreshold(0.3f).build());
        String title = call.getString("title", "");
        String summary = call.getString("summary", "");
        if (title.trim().isEmpty() || title.length() > 1000 || summary.length() > 1000) {
            call.reject("نص الخبر غير صالح للترجمة.");
            return;
        }
        Tasks.whenAllSuccess(translatePart(title), translatePart(summary))
            .addOnSuccessListener(parts -> {
                JSObject result = new JSObject();
                result.put("title", (String) parts.get(0));
                result.put("summary", (String) parts.get(1));
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject(
                error.getMessage() == null ? "تعذر ترجمة الخبر. أعد المحاولة." : error.getMessage(), error));
    }

    @Override protected void handleOnDestroy() {
        if (identifier != null) { identifier.close(); identifier = null; }
        super.handleOnDestroy();
    }
}
