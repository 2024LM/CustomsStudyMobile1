package com.nexus.customsstudy;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NexusAdsPlugin.class);
        registerPlugin(NexusStoragePlugin.class);
        registerPlugin(NexusStudyAlarmPlugin.class);
        registerPlugin(NexusTtsPlugin.class);
        registerPlugin(NexusNewsTranslatePlugin.class);
        registerPlugin(NexusSecureSecretsPlugin.class);
        registerPlugin(NexusFileExportPlugin.class);
        registerPlugin(NexusPdfPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setVerticalScrollBarEnabled(false);
            getBridge().getWebView().setHorizontalScrollBarEnabled(false);
        }
        captureReminderQuestion(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureReminderQuestion(intent);
    }

    private void captureReminderQuestion(Intent intent) {
        if (intent == null) return;
        long rowId = intent.getLongExtra("questionRowId", -1L);
        String bankId = intent.getStringExtra("questionBankId");
        if (rowId <= 0 || bankId == null || bankId.isEmpty()) return;

        getSharedPreferences("study_question_reminders", MODE_PRIVATE)
            .edit()
            .putLong("pending_question_row_id", rowId)
            .putString("pending_question_bank_id", bankId)
            .apply();

        intent.removeExtra("questionRowId");
        intent.removeExtra("questionBankId");
    }
}
