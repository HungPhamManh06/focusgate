package com.focusgate.app.service

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.focusgate.app.ui.BlockOverlayContent
import com.focusgate.app.ui.theme.FocusGateTheme

class BlockOverlayController(private val context: Context) {

    private val windowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    private var view: ComposeView? = null
    private var lifecycleOwner: OverlayLifecycleOwner? = null
    private var shownPackage: String? = null

    fun show(
        packageName: String,
        appLabel: String,
        onBackHome: () -> Unit,
        onOpenFocusGate: () -> Unit,
        onEmergency: () -> Unit,
    ): Boolean {
        if (isShowingFor(packageName)) return true
        hide()

        val owner = OverlayLifecycleOwner().also { it.create() }
        val overlay = ComposeView(context).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
            setViewTreeLifecycleOwner(owner)
            setViewTreeSavedStateRegistryOwner(owner)
            setContent {
                FocusGateTheme {
                    BlockOverlayContent(
                        appLabel = appLabel,
                        onBackHome = onBackHome,
                        onOpenFocusGate = onOpenFocusGate,
                        onEmergency = onEmergency,
                    )
                }
            }
        }

        return try {
            windowManager.addView(overlay, layoutParams())
            view = overlay
            lifecycleOwner = owner
            shownPackage = packageName
            true
        } catch (throwable: Throwable) {
            Log.w(TAG, "Could not add block overlay", throwable)
            runCatching { overlay.disposeComposition() }
            owner.destroy()
            false
        }
    }

    fun hide() {
        val overlay = view
        val owner = lifecycleOwner
        view = null
        lifecycleOwner = null
        shownPackage = null

        if (overlay != null) {
            runCatching { windowManager.removeViewImmediate(overlay) }
            runCatching { overlay.disposeComposition() }
        }
        owner?.destroy()
    }

    fun isShowingFor(packageName: String): Boolean =
        view != null && shownPackage == packageName

    private fun layoutParams(): WindowManager.LayoutParams =
        WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.OPAQUE,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            setTitle("FocusGate")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

    private class OverlayLifecycleOwner : LifecycleOwner, SavedStateRegistryOwner {
        private val lifecycleRegistry = LifecycleRegistry(this)
        private val savedStateController = SavedStateRegistryController.create(this)

        override val lifecycle: Lifecycle
            get() = lifecycleRegistry

        override val savedStateRegistry: SavedStateRegistry
            get() = savedStateController.savedStateRegistry

        fun create() {
            savedStateController.performAttach()
            savedStateController.performRestore(null)
            lifecycleRegistry.currentState = Lifecycle.State.RESUMED
        }

        fun destroy() {
            lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        }
    }

    private companion object {
        const val TAG = "FocusGateOverlay"
    }
}
