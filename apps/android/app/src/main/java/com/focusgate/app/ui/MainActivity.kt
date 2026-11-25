package com.focusgate.app.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.focusgate.app.ui.theme.FocusGateTheme
import com.focusgate.app.util.AgentPreferences

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val openAddTask = intent?.getBooleanExtra(EXTRA_OPEN_ADD_TASK, false) == true
        setContent {
            FocusGateTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    FocusGateRoot(openAddTaskOnLaunch = openAddTask)
                }
            }
        }
    }

    companion object {
        const val EXTRA_OPEN_ADD_TASK = "open_add_task"
    }
}

@Composable
private fun FocusGateRoot(openAddTaskOnLaunch: Boolean = false) {
    val context = LocalContext.current
    var onboardingComplete by remember {
        mutableStateOf(AgentPreferences.isOnboardingComplete(context))
    }

    if (onboardingComplete) {
        HomeScreen(
            onOpenSetup = {
                AgentPreferences.setOnboardingComplete(context, false)
                onboardingComplete = false
            },
            openAddTaskOnLaunch = openAddTaskOnLaunch,
        )
    } else {
        OnboardingScreen(
            onFinished = {
                AgentPreferences.setOnboardingComplete(context, true)
                onboardingComplete = true
            },
        )
    }
}
