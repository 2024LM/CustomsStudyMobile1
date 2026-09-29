package com.nexus.customsstudy;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Build;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public class StudyAlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_FIRE = "com.nexus.customsstudy.STUDY_ALARM_FIRE";
    public static final String ACTION_STOP = "com.nexus.customsstudy.STUDY_ALARM_STOP";
    private static final int REQUEST_CODE = 7401;
    private static final String DATABASE_NAME = "customs_study_core.db";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_STOP.equals(intent.getAction())) {
            context.stopService(new Intent(context, StudyAlarmService.class));
            return;
        }

        DailyPlan plan = readDailyPlan(context);
        if (plan.examExpired) {
            cancelNext(context);
            return;
        }

        Intent service = new Intent(context, StudyAlarmService.class);
        service.putExtras(intent);
        if (plan.available) {
            service.putExtra("title", plan.title);
            String customMessage = intent.getStringExtra("customMessage");
            service.putExtra("message", customMessage != null && !customMessage.trim().isEmpty() ? customMessage.trim() : plan.message);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(service);
        } else {
            context.startService(service);
        }

        if (intent.getBooleanExtra("repeatDaily", false)) {
            int hour = intent.getIntExtra("hour", -1);
            int minute = intent.getIntExtra("minute", -1);
            if (hour >= 0 && minute >= 0) scheduleNextDaily(context, intent, hour, minute);
        }
    }

    private DailyPlan readDailyPlan(Context context) {
        File dbFile = context.getDatabasePath(DATABASE_NAME);
        if (!dbFile.exists()) return DailyPlan.unavailable();

        SQLiteDatabase db = null;
        try {
            db = SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);

            String examDate = setting(db, "study_plan_exam_date", "");
            if (examDate.isEmpty()) return DailyPlan.unavailable();

            Calendar examEnd = Calendar.getInstance();
            Date parsed = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(examDate);
            if (parsed == null) return DailyPlan.unavailable();
            examEnd.setTime(parsed);
            examEnd.set(Calendar.HOUR_OF_DAY, 23);
            examEnd.set(Calendar.MINUTE, 59);
            examEnd.set(Calendar.SECOND, 59);
            examEnd.set(Calendar.MILLISECOND, 999);

            long now = System.currentTimeMillis();
            if (examEnd.getTimeInMillis() < now) {
                return DailyPlan.expired();
            }

            long dayMs = 24L * 60L * 60L * 1000L;
            int daysRemaining = Math.max(1, (int) Math.ceil((examEnd.getTimeInMillis() - now) / (double) dayMs));

            String scope = setting(db, "study_plan_scope", "ALL");
            boolean autoTarget = !"0".equals(setting(db, "study_plan_auto_target", "1"));
            int manualTarget = parseInt(setting(db, "study_plan_daily_target", "20"), 20);
            manualTarget = Math.min(500, Math.max(1, manualTarget));

            ScopeCounts counts = readScopeCounts(db, scope);
            int target = autoTarget
                ? Math.max(1, (int) Math.ceil(counts.unseenPlayable / (double) daysRemaining))
                : manualTarget;
            target = Math.min(500, target);

            Calendar today = Calendar.getInstance();
            today.set(Calendar.HOUR_OF_DAY, 0);
            today.set(Calendar.MINUTE, 0);
            today.set(Calendar.SECOND, 0);
            today.set(Calendar.MILLISECOND, 0);
            int doneToday = readTodayAnswered(db, scope, today.getTimeInMillis());
            int remainingToday = Math.max(0, target - doneToday);

            String title = remainingToday == 0 ? "✅ أنجزت خطة اليوم" : "🎓 خطة مراجعة اليوم";
            String message;
            if (counts.playable == 0) {
                message = "لا توجد أسئلة جاهزة للمراجعة حاليًا. بقي " + daysRemaining + " يوم على الامتحان.";
            } else if (remainingToday == 0) {
                message = "أكملت " + doneToday + " سؤال اليوم. بقي " + daysRemaining + " يوم و"
                    + counts.unseenPlayable + " سؤال لم تراجعه بعد.";
            } else {
                message = "هدف اليوم " + target + " سؤال · أنجزت " + doneToday
                    + " · المتبقي " + remainingToday + " · بقي " + daysRemaining + " يوم على الامتحان.";
            }

            return DailyPlan.ready(title, message);
        } catch (Exception ignored) {
            return DailyPlan.unavailable();
        } finally {
            if (db != null) db.close();
        }
    }

    private ScopeCounts readScopeCounts(SQLiteDatabase db, String scope) {
        String where = playableWhere(scope);
        String[] args = playableArgs(db, scope);
        String sql = "SELECT COUNT(*), SUM(CASE WHEN COALESCE(s.times_seen,0)=0 THEN 1 ELSE 0 END) "
            + "FROM questions q "
            + "JOIN banks b ON b.id=q.bank_id "
            + "LEFT JOIN question_states s ON s.question_row_id=q.row_id "
            + "WHERE " + where;

        try (Cursor c = db.rawQuery(sql, args)) {
            if (c.moveToFirst()) {
                return new ScopeCounts(c.getInt(0), c.isNull(1) ? 0 : c.getInt(1));
            }
        }
        return new ScopeCounts(0, 0);
    }

    private int readTodayAnswered(SQLiteDatabase db, String scope, long todayStart) {
        String where = playableWhere(scope);
        String[] baseArgs = playableArgs(db, scope);
        String[] args = new String[baseArgs.length + 1];
        System.arraycopy(baseArgs, 0, args, 0, baseArgs.length);
        args[args.length - 1] = String.valueOf(todayStart);

        String sql = "SELECT COUNT(*) FROM attempts a "
            + "JOIN questions q ON q.row_id=a.question_row_id "
            + "JOIN banks b ON b.id=q.bank_id "
            + "WHERE " + where + " AND a.answered_at>=?";

        try (Cursor c = db.rawQuery(sql, args)) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    private String playableWhere(String scope) {
        StringBuilder where = new StringBuilder();
        where.append("q.enabled=1 AND b.enabled=1 AND q.qcm_status='READY' AND ");
        where.append("((q.question_type='TRUE_FALSE' AND TRIM(LOWER(q.correct_answer)) IN ('صحيح','خطأ','true','false')) ");
        where.append("OR (q.question_type='QCM' AND q.wrong1<>'' AND q.wrong2<>'' AND q.wrong3<>'')) ");
        if ("ALL".equals(scope)) {
            where.append("AND b.domain_id=?");
        } else {
            where.append("AND b.id=?");
        }
        return where.toString();
    }

    private String[] playableArgs(SQLiteDatabase db, String scope) {
        if (!"ALL".equals(scope)) return new String[]{scope};
        return new String[]{setting(db, "active_domain_id", "")};
    }

    private String setting(SQLiteDatabase db, String key, String fallback) {
        try (Cursor c = db.rawQuery("SELECT value FROM settings WHERE key=? LIMIT 1", new String[]{key})) {
            if (c.moveToFirst()) {
                String value = c.getString(0);
                return value == null ? fallback : value;
            }
        } catch (Exception ignored) {}
        return fallback;
    }

    private int parseInt(String value, int fallback) {
        try { return Integer.parseInt(value); } catch (Exception ignored) { return fallback; }
    }

    private void scheduleNextDaily(Context context, Intent source, int hour, int minute) {
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        next.add(Calendar.DAY_OF_YEAR, 1);

        Intent again = new Intent(context, StudyAlarmReceiver.class);
        again.setAction(ACTION_FIRE);
        again.putExtras(source);
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            again,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pending);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pending);
        } else {
            manager.setExact(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pending);
        }
    }

    private void cancelNext(Context context) {
        Intent intent = new Intent(context, StudyAlarmReceiver.class);
        intent.setAction(ACTION_FIRE);
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (pending != null) {
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            manager.cancel(pending);
            pending.cancel();
        }
    }

    private static final class ScopeCounts {
        final int playable;
        final int unseenPlayable;
        ScopeCounts(int playable, int unseenPlayable) {
            this.playable = playable;
            this.unseenPlayable = unseenPlayable;
        }
    }

    private static final class DailyPlan {
        final boolean available;
        final boolean examExpired;
        final String title;
        final String message;

        private DailyPlan(boolean available, boolean examExpired, String title, String message) {
            this.available = available;
            this.examExpired = examExpired;
            this.title = title;
            this.message = message;
        }

        static DailyPlan unavailable() {
            return new DailyPlan(false, false, "", "");
        }

        static DailyPlan expired() {
            return new DailyPlan(false, true, "", "");
        }

        static DailyPlan ready(String title, String message) {
            return new DailyPlan(true, false, title, message);
        }
    }
}
