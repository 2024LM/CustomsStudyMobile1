package com.nexus.customsstudy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NexusAdsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
