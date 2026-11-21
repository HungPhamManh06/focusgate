package com.focusgate.testtarget;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

public class TestTargetActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView text = new TextView(this);
        text.setText("FocusGate test target");
        text.setTextSize(26);
        text.setGravity(Gravity.CENTER);
        setContentView(text);
    }
}
