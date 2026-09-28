package com.nexus.customsstudy;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NexusFileExport")
public class NexusFileExportPlugin extends Plugin {

    @PluginMethod
    public void saveTextFile(PluginCall call) {
        String filename = call.getString("filename", "export.json");
        String content = call.getString("content", "");
        String mimeType = call.getString("mimeType", "application/json");

        if (content == null) content = "";
        if (filename == null || filename.trim().isEmpty()) filename = "export.json";

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);

        startActivityForResult(call, intent, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("saved", false);
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("لم يتم اختيار موقع صالح لحفظ الملف.");
            return;
        }

        String content = call.getString("content", "");
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (stream == null) {
                call.reject("تعذر فتح الملف للكتابة.");
                return;
            }
            stream.write(content.getBytes(StandardCharsets.UTF_8));
            stream.flush();

            JSObject response = new JSObject();
            response.put("saved", true);
            response.put("cancelled", false);
            response.put("uri", uri.toString());
            call.resolve(response);
        } catch (Exception e) {
            call.reject("تعذر حفظ ملف JSON.", e);
        }
    }
}
