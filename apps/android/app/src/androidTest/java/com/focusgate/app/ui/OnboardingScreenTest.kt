package com.focusgate.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.platform.app.InstrumentationRegistry
import com.focusgate.app.ui.theme.FocusGateTheme
import com.focusgate.app.util.AgentPreferences
import org.junit.Rule
import org.junit.Test

class OnboardingScreenTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun introShowsDisclosureAndStartsSetup() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        AgentPreferences.setPrivacyConsent(context, false)

        compose.setContent {
            FocusGateTheme {
                OnboardingScreen(onFinished = {})
            }
        }

        compose.onNodeWithText("A gate for the apps you choose.").assertIsDisplayed()
        compose.onNodeWithText("Get started").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithTag("privacy_consent").performScrollTo().performClick()
        compose.onNodeWithText("Get started").performScrollTo().assertIsEnabled().performClick()
        compose.onNodeWithText("1. Allow Usage Access").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun emergencyAccessIsDisclosedDuringSetup() {
        compose.setContent {
            FocusGateTheme {
                OnboardingScreen(onFinished = {})
            }
        }

        compose.onNodeWithText("Emergency access is available", substring = true)
            .performScrollTo()
            .assertIsDisplayed()
    }
}
