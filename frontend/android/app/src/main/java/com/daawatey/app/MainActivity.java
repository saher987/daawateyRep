package com.daawatey.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins (not npm packages) must be registered before
        // super.onCreate so the bridge loads them.
        registerPlugin(SmsUserConsentPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
