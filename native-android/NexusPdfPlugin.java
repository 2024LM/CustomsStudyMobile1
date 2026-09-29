package com.nexus.customsstudy;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "NexusPdf")
public class NexusPdfPlugin extends Plugin {
    private PdfRenderer renderer;
    private ParcelFileDescriptor descriptor;
    private File tempFile;

    private synchronized void closeCurrent() {
        try {
            if (renderer != null) renderer.close();
        } catch (Exception ignored) {}
        try {
            if (descriptor != null) descriptor.close();
        } catch (Exception ignored) {}
        if (tempFile != null) {
            try { tempFile.delete(); } catch (Exception ignored) {}
        }
        renderer = null;
        descriptor = null;
        tempFile = null;
    }

    @PluginMethod
    public void load(PluginCall call) {
        String base64 = call.getString("base64", "");
        if (base64 == null || base64.isEmpty()) {
            call.reject("PDF data is empty.");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (bytes.length < 5 ||
                bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-') {
                call.reject("Invalid PDF file.");
                return;
            }
            if (bytes.length > 30 * 1024 * 1024) {
                call.reject("PDF exceeds the 30 MB native reader limit.");
                return;
            }

            closeCurrent();
            tempFile = File.createTempFile("nexus_pdf_", ".pdf", getContext().getCacheDir());
            try (FileOutputStream stream = new FileOutputStream(tempFile)) {
                stream.write(bytes);
                stream.flush();
            }

            descriptor = ParcelFileDescriptor.open(tempFile, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(descriptor);

            JSObject result = new JSObject();
            result.put("pages", renderer.getPageCount());
            call.resolve(result);
        } catch (IllegalArgumentException e) {
            closeCurrent();
            call.reject("Unable to decode PDF data.", e);
        } catch (SecurityException e) {
            closeCurrent();
            call.reject("Password-protected or unsupported PDF.", e);
        } catch (Exception e) {
            closeCurrent();
            call.reject("Unable to open PDF.", e);
        }
    }

    @PluginMethod
    public synchronized void render(PluginCall call) {
        if (renderer == null) {
            call.reject("No PDF is open.");
            return;
        }

        int pageIndex = call.getInt("page", 0);
        int targetWidth = call.getInt("width", 1200);
        targetWidth = Math.max(480, Math.min(targetWidth, 2400));

        if (pageIndex < 0 || pageIndex >= renderer.getPageCount()) {
            call.reject("Page is out of range.");
            return;
        }

        PdfRenderer.Page page = null;
        Bitmap bitmap = null;
        ByteArrayOutputStream output = null;
        try {
            page = renderer.openPage(pageIndex);
            float ratio = page.getHeight() / (float) Math.max(1, page.getWidth());
            int targetHeight = Math.max(1, Math.min(Math.round(targetWidth * ratio), 3600));

            bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            canvas.drawColor(Color.WHITE);

            float scaleX = targetWidth / (float) page.getWidth();
            float scaleY = targetHeight / (float) page.getHeight();
            float scale = Math.min(scaleX, scaleY);
            Matrix matrix = new Matrix();
            matrix.postScale(scale, scale);

            page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);

            output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
            String image = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);

            JSObject result = new JSObject();
            result.put("imageBase64", image);
            result.put("width", targetWidth);
            result.put("height", targetHeight);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Unable to render PDF page.", e);
        } finally {
            try { if (page != null) page.close(); } catch (Exception ignored) {}
            try { if (output != null) output.close(); } catch (Exception ignored) {}
            if (bitmap != null) bitmap.recycle();
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        closeCurrent();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        closeCurrent();
        super.handleOnDestroy();
    }
}
