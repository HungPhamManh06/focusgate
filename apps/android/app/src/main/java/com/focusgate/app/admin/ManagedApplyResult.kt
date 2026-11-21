package com.focusgate.app.admin

data class ManagedApplyResult(
    val applied: Boolean,
    val suspendedPackages: Int,
    val failures: List<String>,
    val message: String,
)
