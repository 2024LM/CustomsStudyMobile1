package com.nexus.customsstudy;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Base64;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.database.Cursor;

import com.getcapacitor.JSArray;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;

@CapacitorPlugin(
    name = "NexusStudyAlarm",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class NexusStudyAlarmPlugin extends Plugin {
    private static final int REQUEST_CODE = 7401;
    private Ringtone previewRingtone;

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }


    @PluginMethod
    public void listDeviceSounds(PluginCall call) {
        try {
            RingtoneManager manager = new RingtoneManager(getContext());
            manager.setType(RingtoneManager.TYPE_ALARM | RingtoneManager.TYPE_NOTIFICATION | RingtoneManager.TYPE_RINGTONE);
            Cursor cursor = manager.getCursor();
            JSArray sounds = new JSArray();
            int index = 0;
            while (cursor.moveToNext() && index < 200) {
                Uri uri = manager.getRingtoneUri(cursor.getPosition());
                String title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX);
                JSObject item = new JSObject();
                item.put("id", "device:" + uri.toString());
                item.put("title", title == null || title.trim().isEmpty() ? "نغمة " + (index + 1) : title);
                item.put("uri", uri.toString());
                sounds.put(item);
                index++;
            }
            cursor.close();
            JSObject result = new JSObject();
            result.put("sounds", sounds);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to list device sounds", error);
        }
    }

    @PluginMethod
    public void previewSound(PluginCall call) {
        try {
            stopPreviewInternal();
            String uriString = call.getString("uri", "");
            if (uriString.isEmpty()) {
                call.reject("Missing sound URI");
                return;
            }
            previewRingtone = RingtoneManager.getRingtone(getContext(), Uri.parse(uriString));
            if (previewRingtone == null) {
                call.reject("Unable to open ringtone");
                return;
            }
            previewRingtone.play();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to preview sound", error);
        }
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        stopPreviewInternal();
        call.resolve();
    }

    private void stopPreviewInternal() {
        if (previewRingtone != null) {
            try { previewRingtone.stop(); } catch (Exception ignored) {}
            previewRingtone = null;
        }
    }

    @PluginMethod
    public void saveCustomSound(PluginCall call) {
        try {
            String base64 = call.getString("base64", "");
            String extension = call.getString("extension", "mp3").replaceAll("[^a-zA-Z0-9]", "");
            if (base64.isEmpty()) {
                call.reject("Missing audio data");
                return;
            }

            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            if (data.length > 12 * 1024 * 1024) {
                call.reject("Audio file exceeds 12 MB");
                return;
            }

            File dir = new File(getContext().getFilesDir(), "study_alarm_audio");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Unable to create audio directory");
                return;
            }

            File out = new File(dir, "custom_alarm." + (extension.isEmpty() ? "mp3" : extension));
            try (FileOutputStream stream = new FileOutputStream(out, false)) {
                stream.write(data);
            }

            JSObject result = new JSObject();
            result.put("path", out.getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to save custom sound", error);
        }
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            long triggerAt = call.getLong("triggerAt", 0L);
            String title = call.getString("title", "وقت المراجعة");
            String message = call.getString("message", "حان وقت جلسة المراجعة.");
            String sound = call.getString("sound", "focus");
            String customPath = call.getString("customPath", "");
            String deviceSoundUri = call.getString("deviceSoundUri", "");
            String customMessage = call.getString("customMessage", "");
            boolean repeatDaily = call.getBoolean("repeatDaily", false);
            int hour = call.getInt("hour", -1);
            int minute = call.getInt("minute", -1);

            if (triggerAt <= System.currentTimeMillis()) {
                call.reject("Alarm time must be in the future");
                return;
            }

            Intent intent = new Intent(getContext(), StudyAlarmReceiver.class);
            intent.setAction(StudyAlarmReceiver.ACTION_FIRE);
            intent.putExtra("title", title);
            intent.putExtra("message", message);
            intent.putExtra("sound", sound);
            intent.putExtra("customPath", customPath);
            intent.putExtra("deviceSoundUri", deviceSoundUri);
            intent.putExtra("customMessage", customMessage);
            intent.putExtra("repeatDaily", repeatDaily);
            intent.putExtra("hour", hour);
            intent.putExtra("minute", minute);

            PendingIntent pending = PendingIntent.getBroadcast(
                getContext(),
                REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            AlarmManager manager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            } else {
                manager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            }

            JSObject result = new JSObject();
            result.put("scheduled", true);
            result.put("exact", Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to schedule study alarm", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Intent intent = new Intent(getContext(), StudyAlarmReceiver.class);
        intent.setAction(StudyAlarmReceiver.ACTION_FIRE);
        PendingIntent pending = PendingIntent.getBroadcast(
            getContext(),
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (pending != null) {
            AlarmManager manager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            manager.cancel(pending);
            pending.cancel();
        }
        call.resolve();
    }
}
