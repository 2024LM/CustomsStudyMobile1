package com.nexus.customsstudy;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "NexusSecureSecrets")
public class NexusSecureSecretsPlugin extends Plugin {
    private static final String STORE = "nexus_secure_secrets";
    private static final String ALIAS = "nexus_ai_api_key";
    private static final String VALUE_KEY = "gemini_api_key_cipher";
    private static final String IV_KEY = "gemini_api_key_iv";

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        );
        generator.init(new KeyGenParameterSpec.Builder(
            ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void setGeminiKey(PluginCall call) {
        String value = call.getString("value", "").trim();
        if (value.isEmpty()) {
            call.reject("API key is empty");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            prefs().edit()
                .putString(VALUE_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(IV_KEY, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to store API key securely", e);
        }
    }

    @PluginMethod
    public void getGeminiKey(PluginCall call) {
        String encryptedText = prefs().getString(VALUE_KEY, "");
        String ivText = prefs().getString(IV_KEY, "");
        JSObject result = new JSObject();

        if (encryptedText.isEmpty() || ivText.isEmpty()) {
            result.put("value", "");
            call.resolve(result);
            return;
        }

        try {
            byte[] encrypted = Base64.decode(encryptedText, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivText, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            byte[] clear = cipher.doFinal(encrypted);
            result.put("value", new String(clear, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to read API key", e);
        }
    }

    @PluginMethod
    public void deleteGeminiKey(PluginCall call) {
        prefs().edit().remove(VALUE_KEY).remove(IV_KEY).apply();
        call.resolve();
    }
}
