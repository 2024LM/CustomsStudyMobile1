package com.nexus.customsstudy;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import java.io.File;

public class StudyAlarmService extends Service {
    private static final int NOTIFICATION_ID = 7410;
    private static final String CHANNEL_ID = "study_alarm_playback";
    private MediaPlayer player;
    private ToneGenerator toneGenerator;
    private Handler handler;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(getMainLooper());
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra("title") : null;
        String message = intent != null ? intent.getStringExtra("message") : null;
        String sound = intent != null ? intent.getStringExtra("sound") : "focus";
        String customPath = intent != null ? intent.getStringExtra("customPath") : "";

        Intent open = new Intent(this, MainActivity.class);
        PendingIntent openApp = PendingIntent.getActivity(
            this, 7411, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stop = new Intent(this, StudyAlarmReceiver.class);
        stop.setAction(StudyAlarmReceiver.ACTION_STOP);
        PendingIntent stopAlarm = PendingIntent.getBroadcast(
            this, 7412, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title == null || title.isEmpty() ? "وقت المراجعة" : title)
            .setContentText(message == null || message.isEmpty() ? "حان وقت جلسة المراجعة." : message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(openApp)
            .addAction(0, "إيقاف", stopAlarm)
            .setSilent(true)
            .build();

        startForeground(NOTIFICATION_ID, notification);
        playSound(sound, customPath);

        handler.postDelayed(this::stopSelf, 90_000);
        return START_NOT_STICKY;
    }

    private void playSound(String sound, String customPath) {
        stopPlayback();

        if ("custom".equals(sound) && customPath != null && !customPath.isEmpty()) {
            try {
                File file = new File(customPath);
                if (file.exists()) {
                    player = new MediaPlayer();
                    player.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build());
                    player.setDataSource(file.getAbsolutePath());
                    player.setLooping(true);
                    player.prepare();
                    player.start();
                    return;
                }
            } catch (Exception ignored) {}
        }

        toneGenerator = new ToneGenerator(AudioManager.STREAM_ALARM, 90);
        final int tone;
        final int duration;
        final int gap;
        if ("calm".equals(sound)) {
            tone = ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD;
            duration = 500;
            gap = 1400;
        } else if ("bell".equals(sound)) {
            tone = ToneGenerator.TONE_PROP_BEEP2;
            duration = 900;
            gap = 700;
        } else {
            tone = ToneGenerator.TONE_PROP_ACK;
            duration = 650;
            gap = 900;
        }

        Runnable loop = new Runnable() {
            @Override public void run() {
                if (toneGenerator == null) return;
                toneGenerator.startTone(tone, duration);
                handler.postDelayed(this, duration + gap);
            }
        };
        handler.post(loop);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "منبّه المراجعة",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setSound(null, null);
            channel.enableVibration(true);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private void stopPlayback() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
            player.release();
            player = null;
        }
        if (toneGenerator != null) {
            toneGenerator.release();
            toneGenerator = null;
        }
        if (handler != null) handler.removeCallbacksAndMessages(null);
    }

    @Override
    public void onDestroy() {
        stopPlayback();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
