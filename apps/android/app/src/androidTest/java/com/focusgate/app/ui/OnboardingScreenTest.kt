package com.focusgate.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.focusgate.app.ui.theme.FocusGateTheme
import org.junit.Rule
import org.junit.Test

class OnboardingScreenTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun introShowsDisclosureAndStartsSetup() {
        compose.setContent {
            FocusGateTheme {
                OnboardingScreen(onFinished = {})
            }
        }

        compose.onNodeWithText("A gate for the apps you choose.").assertIsDisplayed()
        compose.onNodeWithText("Get started").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Get started").performClick()
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
