package com.nexus.customsstudy;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Calendar;

public class StudyAlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_FIRE = "com.nexus.customsstudy.STUDY_ALARM_FIRE";
    public static final String ACTION_STOP = "com.nexus.customsstudy.STUDY_ALARM_STOP";
    private static final int REQUEST_CODE = 7401;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_STOP.equals(intent.getAction())) {
            context.stopService(new Intent(context, StudyAlarmService.class));
            return;
        }

        Intent service = new Intent(context, StudyAlarmService.class);
        service.putExtras(intent);
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
}
