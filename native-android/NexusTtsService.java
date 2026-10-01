package com.nexus.customsstudy;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class NexusTtsService extends Service implements TextToSpeech.OnInitListener {
    public static final String ACTION_SPEAK = "com.nexus.customsstudy.tts.SPEAK";
    public static final String ACTION_STOP = "com.nexus.customsstudy.tts.STOP";

    public static final String ACTION_PLAYBACK = "com.nexus.customsstudy.tts.PLAYBACK";
    private static volatile String playbackRequestId = "";
    private static volatile String playbackState = "idle";
    private String currentRequestId = "";
    private volatile String utterancePrefix = "";

    public static synchronized com.getcapacitor.JSObject playbackSnapshot() {
        com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
        result.put("requestId", playbackRequestId);
        result.put("state", playbackState);
        return result;
    }

    private void publishPlayback(String state) {
        synchronized (NexusTtsService.class) {
            playbackRequestId = currentRequestId;
            playbackState = state;
        }
        Intent event = new Intent(ACTION_PLAYBACK);
        event.setPackage(getPackageName());
        event.putExtra("requestId", currentRequestId);
        event.putExtra("state", state);
        sendBroadcast(event);
    }

    private static final String CHANNEL_ID = "raje3_tts_playback";
    private static final int NOTIFICATION_ID = 7410;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean ready = false;
    private Intent pendingSpeakIntent;
    private volatile String lastUtteranceId = "";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification(false));
        tts = new TextToSpeech(getApplicationContext(), this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopPlayback();
            return START_NOT_STICKY;
        }

        if (ACTION_SPEAK.equals(action)) {
            utterancePrefix = "";
            lastUtteranceId = "";
            if (tts != null) tts.stop();
            currentRequestId = intent.getStringExtra("requestId");
            if (currentRequestId == null) currentRequestId = "";
            publishPlayback("loading");
            pendingSpeakIntent = intent;
            if (ready) speakPending();
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (!ready) {
            stopPlayback("error");
            return;
        }

        tts.setPitch(1.0f);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {
                mainHandler.post(() -> {
                    if (utteranceId == null || !utteranceId.startsWith(utterancePrefix) || utterancePrefix.isEmpty()) return;
                    publishPlayback("speaking");
                    updateNotification(true);
                });
            }

            @Override public void onDone(String utteranceId) {
                mainHandler.post(() -> {
                    if (utteranceId != null && !utterancePrefix.isEmpty() && utteranceId.equals(lastUtteranceId)) {
                        publishPlayback("done");
                        utterancePrefix = "";
                        stopForeground(true);
                        stopSelf();
                    }
                });
            }

            @Override public void onError(String utteranceId) {
                mainHandler.post(() -> {
                    if (utteranceId != null && !utterancePrefix.isEmpty() && utteranceId.startsWith(utterancePrefix)) {
                        stopPlayback("error");
                    }
                });
            }
        });

        if (pendingSpeakIntent != null) speakPending();
    }

    private void speakPending() {
        Intent intent = pendingSpeakIntent;
        pendingSpeakIntent = null;
        if (intent == null || tts == null || !ready) return;

        String text = intent.getStringExtra("text");
        if (text == null || text.trim().isEmpty()) {
            stopPlayback();
            return;
        }

        String requestedVoice = intent.getStringExtra("voice");
        float rate = intent.getFloatExtra("rate", 1.0f);
        tts.setSpeechRate(Math.max(0.5f, Math.min(rate, 1.5f)));

        Voice voice = findVoice(requestedVoice);
        if (voice != null) {
            tts.setVoice(voice);
        } else {
            selectBestArabicVoice();
        }

        List<String> chunks = splitForSpeech(text);
        if (chunks.isEmpty()) {
            stopPlayback();
            return;
        }

        tts.stop();
        String baseId = "raje3_tts_" + System.nanoTime();
        utterancePrefix = baseId + "_";
        lastUtteranceId = baseId + "_" + (chunks.size() - 1);

        for (int i = 0; i < chunks.size(); i++) {
            int queueMode = i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;
            String id = baseId + "_" + i;
            int result = tts.speak(chunks.get(i), queueMode, null, id);
            if (result == TextToSpeech.ERROR) {
                stopPlayback("error");
                return;
            }
        }

        updateNotification(true);
    }

    private Voice findVoice(String name) {
        if (name == null || name.trim().isEmpty() || tts == null) return null;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null) return null;
            for (Voice voice : voices) {
                if (name.equals(voice.getName())) return voice;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private void selectBestArabicVoice() {
        if (tts == null) return;
        Locale[] preferred = new Locale[] {
            new Locale("ar", "MA"),
            new Locale("ar", "SA"),
            new Locale("ar", "EG"),
            new Locale("ar")
        };

        for (Locale locale : preferred) {
            if (tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(locale);
                break;
            }
        }

        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null) return;
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
            if (best != null) tts.setVoice(best);
        } catch (Exception ignored) {}
    }

    private List<String> splitForSpeech(String text) {
        List<String> chunks = new ArrayList<>();
        int engineLimit = TextToSpeech.getMaxSpeechInputLength();
        int safeLimit = Math.max(500, Math.min(engineLimit - 100, 3200));
        String remaining = text == null ? "" : text.trim();

        while (!remaining.isEmpty()) {
            if (remaining.length() <= safeLimit) {
                chunks.add(remaining);
                break;
            }

            int searchStart = Math.max(0, safeLimit - 700);
            int best = -1;
            char[] separators = new char[] {'\n', '.', '!', '?', '؟', '؛', ';', '،', ','};

            for (int i = safeLimit; i >= searchStart; i--) {
                char ch = remaining.charAt(i - 1);
                for (char separator : separators) {
                    if (ch == separator) {
                        best = i;
                        break;
                    }
                }
                if (best > 0) break;
            }

            if (best <= 0) {
                int space = remaining.lastIndexOf(' ', safeLimit);
                best = space > searchStart ? space + 1 : safeLimit;
            }

            String chunk = remaining.substring(0, best).trim();
            if (!chunk.isEmpty()) chunks.add(chunk);
            remaining = remaining.substring(best).trim();
        }
        return chunks;
    }

    private void stopPlayback() { stopPlayback("stopped"); }

    private void stopPlayback(String state) {
        utterancePrefix = "";
        publishPlayback(state);
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) {}
        }
        stopForeground(true);
        stopSelf();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "القراءة الصوتية",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("التحكم في قراءة مواضيع ومراجع Raje3");
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(boolean playing) {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent openPending = PendingIntent.getActivity(
            this,
            7411,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, NexusTtsService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(
            this,
            7412,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        return builder
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle("Raje3")
            .setContentText(playing ? "جاري قراءة الموضوع صوتيًا" : "جاري تجهيز القراءة الصوتية")
            .setContentIntent(openPending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .addAction(android.R.drawable.ic_media_pause, "إيقاف", stopPending)
            .build();
    }

    private void updateNotification(boolean playing) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(playing));
    }

    @Override
    public void onDestroy() {
        if ("loading".equals(playbackState) || "speaking".equals(playbackState)) publishPlayback("stopped");
        utterancePrefix = "";
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) {}
            tts.shutdown();
            tts = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
