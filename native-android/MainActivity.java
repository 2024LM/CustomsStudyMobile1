package com.nexus.customsstudy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NexusAdsPlugin.class);
        registerPlugin(NexusStoragePlugin.class);
        registerPlugin(NexusStudyAlarmPlugin.class);
        registerPlugin(NexusTtsPlugin.class);
        registerPlugin(NexusSecureSecretsPlugin.class);
        registerPlugin(NexusNanoAiPlugin.class);
        registerPlugin(NexusFileExportPlugin.class);
        registerPlugin(NexusPdfPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
