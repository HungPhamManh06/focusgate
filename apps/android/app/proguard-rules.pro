# FocusGate PoC keeps minification disabled. Room's generated code is referenced
# reflectively on some paths, so keep the database classes if minification is
# enabled later.
-keep class com.focusgate.app.data.** { *; }
