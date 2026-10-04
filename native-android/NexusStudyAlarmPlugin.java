package com.nexus.customsstudy;

import android.Manifest;
import android.content.pm.PackageManager;
import android.provider.MediaStore;
import androidx.core.app.NotificationManagerCompat;
import android.content.ContentUris;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Base64;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.media.MediaPlayer;
import android.media.AudioAttributes;
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
        ),
        @Permission(
            alias = "audio",
            strings = { Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_EXTERNAL_STORAGE }
        )
    }
)
public class NexusStudyAlarmPlugin extends Plugin {
    private static final int REQUEST_CODE = 7401;
    private static final int QUESTION_REQUEST_CODE = 7403;
    private Ringtone previewRingtone;
    private MediaPlayer previewPlayer;

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = NotificationManagerCompat.from(getContext()).areNotificationsEnabled()
            && (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || getPermissionState("notifications") == PermissionState.GRANTED);
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void checkAudioPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasAudioPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            JSObject result = new JSObject();
            result.put("granted", false);
            call.resolve(result);
            return;
        }
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
    public void requestAudioPermission(PluginCall call) {
        if (hasAudioPermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("audio", call, "audioPermissionCallback");
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasAudioPermission());
        call.resolve(result);
    }

    private boolean hasAudioPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }
        return getContext().checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void listDeviceSounds(PluginCall call) {
        try {
            JSArray sounds = new JSArray();

            RingtoneManager manager = new RingtoneManager(getContext());
            manager.setType(RingtoneManager.TYPE_ALARM | RingtoneManager.TYPE_NOTIFICATION | RingtoneManager.TYPE_RINGTONE);
            Cursor cursor = manager.getCursor();
            int index = 0;
            while (cursor.moveToNext() && index < 100) {
                Uri uri = manager.getRingtoneUri(cursor.getPosition());
                String title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX);
                JSObject item = new JSObject();
                item.put("id", "ringtone:" + uri.toString());
                item.put("title", title == null || title.trim().isEmpty() ? "نغمة " + (index + 1) : title);
                item.put("uri", uri.toString());
                item.put("kind", "ringtone");
                sounds.put(item);
                index++;
            }
            cursor.close();

            if (hasAudioPermission()) {
                String[] projection = {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.DURATION
                };
                String selection = MediaStore.Audio.Media.IS_MUSIC + "!=0";
                try (Cursor media = getContext().getContentResolver().query(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    projection,
                    selection,
                    null,
                    MediaStore.Audio.Media.DATE_ADDED + " DESC"
                )) {
                    if (media != null) {
                        int idCol = media.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                        int titleCol = media.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                        int artistCol = media.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                        int count = 0;
                        while (media.moveToNext() && count < 200) {
                            long id = media.getLong(idCol);
                            Uri uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
                            String title = media.getString(titleCol);
                            String artist = media.getString(artistCol);
                            JSObject item = new JSObject();
                            item.put("id", "music:" + id);
                            item.put("title", (title == null || title.trim().isEmpty() ? "موسيقى " + (count + 1) : title)
                                + (artist == null || artist.trim().isEmpty() ? "" : " — " + artist));
                            item.put("uri", uri.toString());
                            item.put("kind", "music");
                            sounds.put(item);
                            count++;
                        }
                    }
                }
            }

            JSObject result = new JSObject();
            result.put("sounds", sounds);
            result.put("audioPermissionGranted", hasAudioPermission());
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
    public void previewCustomSound(PluginCall call) {
        try {
            stopPreviewInternal();
            String path = call.getString("path", "");
            if (path.isEmpty()) {
                call.reject("Missing custom sound path");
                return;
            }
            File file = new File(path);
            if (!file.exists()) {
                call.reject("Custom sound file not found");
                return;
            }
            previewPlayer = new MediaPlayer();
            previewPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
            previewPlayer.setDataSource(file.getAbsolutePath());
            previewPlayer.setLooping(false);
            previewPlayer.prepare();
            previewPlayer.start();
            call.resolve();
        } catch (Exception error) {
            stopPreviewInternal();
            call.reject("Unable to preview custom sound", error);
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
        if (previewPlayer != null) {
            try { previewPlayer.stop(); } catch (Exception ignored) {}
            previewPlayer.release();
            previewPlayer = null;
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
    public void scheduleQuestionReminder(PluginCall call) {
        try {
            long triggerAt = call.getLong("triggerAt", 0L);
            int intervalHours = Math.max(1, Math.min(call.getInt("intervalHours", 1), 24));
            if (triggerAt <= System.currentTimeMillis()) {
                call.reject("Question reminder time must be in the future");
                return;
            }

            Intent intent = new Intent(getContext(), StudyAlarmReceiver.class);
            intent.setAction(StudyAlarmReceiver.ACTION_QUESTION_FIRE);
            intent.putExtra("intervalHours", intervalHours);

            PendingIntent pending = PendingIntent.getBroadcast(
                getContext(),
                QUESTION_REQUEST_CODE,
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
            call.reject("Unable to schedule question reminder", error);
        }
    }


    @PluginMethod
    public void consumePendingQuestion(PluginCall call) {
        android.content.SharedPreferences prefs = getContext().getSharedPreferences("study_question_reminders", Context.MODE_PRIVATE);
        long rowId = prefs.getLong("pending_question_row_id", -1L);
        String bankId = prefs.getString("pending_question_bank_id", "");
        JSObject result = new JSObject();
        if (rowId > 0 && bankId != null && !bankId.isEmpty()) {
            result.put("rowId", rowId);
            result.put("bankId", bankId);
            prefs.edit().remove("pending_question_row_id").remove("pending_question_bank_id").apply();
        }
        call.resolve(result);
    }

    @PluginMethod
    public void cancelQuestionReminder(PluginCall call) {
        Intent intent = new Intent(getContext(), StudyAlarmReceiver.class);
        intent.setAction(StudyAlarmReceiver.ACTION_QUESTION_FIRE);
        PendingIntent pending = PendingIntent.getBroadcast(
            getContext(),
            QUESTION_REQUEST_CODE,
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
