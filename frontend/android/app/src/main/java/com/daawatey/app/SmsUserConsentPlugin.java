package com.daawatey.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the login OTP from the incoming SMS with Android's SMS User Consent
 * API: Android shows a one-tap "allow Daawatey to read this message" sheet
 * and hands back just that one message. No SMS permission, and the SMS text
 * needs no special format (unlike the SMS Retriever API's app hash).
 *
 * The WebView can't do this itself — WebOTP (PhoneOtpLogin.jsx) only works
 * in Chrome, not in an embedded WebView.
 *
 * JS: start() resolves with { code } once the user allows it, or rejects
 * (timeout after ~5 minutes, user declined, or stop() called).
 */
@CapacitorPlugin(name = "SmsUserConsent")
public class SmsUserConsentPlugin extends Plugin {

    private static final Pattern SIX_DIGITS = Pattern.compile("(\\d{6})");

    private BroadcastReceiver receiver;
    private String pendingCallId;

    @PluginMethod
    public void start(PluginCall call) {
        cancelPending("replaced");
        bridge.saveCall(call);
        pendingCallId = call.getCallbackId();

        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) return;
                Bundle extras = intent.getExtras();
                Status status = extras == null ? null : (Status) extras.get(SmsRetriever.EXTRA_STATUS);
                PluginCall saved = pendingCall();
                unregister();
                if (saved == null) return;
                if (status == null || status.getStatusCode() != CommonStatusCodes.SUCCESS) {
                    finish(saved, null, "timeout");
                    return;
                }
                Intent consentIntent = extras.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT);
                if (consentIntent == null) {
                    finish(saved, null, "no_consent_intent");
                    return;
                }
                startActivityForResult(saved, consentIntent, "onConsentResult");
            }
        };
        ContextCompat.registerReceiver(
            getContext(),
            receiver,
            new IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION),
            SmsRetriever.SEND_PERMISSION,
            null,
            ContextCompat.RECEIVER_EXPORTED
        );

        // null sender: accept the code from any sender not in the user's
        // contacts (the OTP comes from Pulseem's sender name).
        SmsRetriever.getClient(getActivity())
            .startSmsUserConsent(null)
            .addOnFailureListener(e -> {
                PluginCall saved = pendingCall();
                unregister();
                if (saved != null) finish(saved, null, "start_failed");
            });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        cancelPending("stopped");
        call.resolve();
    }

    @ActivityCallback
    private void onConsentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            finish(call, null, "denied");
            return;
        }
        String message = result.getData().getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE);
        Matcher m = SIX_DIGITS.matcher(message == null ? "" : message);
        finish(call, m.find() ? m.group(1) : null, "no_code");
    }

    @Override
    protected void handleOnDestroy() {
        cancelPending("destroyed");
    }

    private PluginCall pendingCall() {
        return pendingCallId == null ? null : bridge.getSavedCall(pendingCallId);
    }

    private void finish(PluginCall call, String code, String errorCode) {
        if (code != null) {
            JSObject ret = new JSObject();
            ret.put("code", code);
            call.resolve(ret);
        } else {
            call.reject(errorCode, errorCode);
        }
        bridge.releaseCall(call);
        if (call.getCallbackId().equals(pendingCallId)) pendingCallId = null;
    }

    private void cancelPending(String reason) {
        PluginCall saved = pendingCall();
        unregister();
        if (saved != null) finish(saved, null, reason);
    }

    private void unregister() {
        if (receiver == null) return;
        try {
            getContext().unregisterReceiver(receiver);
        } catch (IllegalArgumentException ignored) {
            // already unregistered
        }
        receiver = null;
    }
}
