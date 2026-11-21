package com.focusgate.app.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

/**
 * Device Owner / managed-device component.
 *
 * FocusGate only uses this component when the device was legitimately
 * provisioned as a fully managed or dedicated device. It is not a way to turn a
 * personal phone into an unmanaged kiosk, and the app never asks for an
 * uninstall-proof state.
 */
class FocusGateDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Toast.makeText(context, "FocusGate device management enabled", Toast.LENGTH_SHORT).show()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Toast.makeText(context, "FocusGate device management disabled", Toast.LENGTH_SHORT).show()
    }
}
