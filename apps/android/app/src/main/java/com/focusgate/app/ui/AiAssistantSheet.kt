package com.focusgate.app.ui

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.focusgate.app.util.PlanSyncManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

private data class AiUiMessage(
    val id: Long,
    val fromUser: Boolean,
    val text: String,
    val viaVoice: Boolean = false,
    val actionLabel: String? = null,
    val actionExecuted: Boolean = false,
)

@Composable
fun AiAssistantSheetContent(
    isVi: Boolean,
    onActionMutated: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var voiceLang by remember { mutableStateOf(if (isVi) "vi-VN" else "en-US") }
    var ttsEnabled by remember { mutableStateOf(false) }
    var voiceError by remember { mutableStateOf<String?>(null) }

    val messages = remember {
        mutableStateListOf(
            AiUiMessage(
                id = 1L,
                fromUser = false,
                text = if (isVi) {
                    "Chào bạn! Tôi là FocusGate AI. Hãy nhập hoặc chạm nút Nói 🎙️ để ra lệnh đồng bộ Web, PC & Android."
                } else {
                    "Hi! I'm FocusGate AI. Type or tap Speak 🎙️ to run synced actions across Web, PC, and Android."
                },
            ),
        )
    }

    var ttsReady by remember { mutableStateOf(false) }
    val tts = remember {
        var engine: TextToSpeech? = null
        engine = TextToSpeech(context.applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
        }
        engine
    }
    DisposableEffect(Unit) {
        onDispose {
            runCatching {
                tts?.stop()
                tts?.shutdown()
            }
        }
    }

    fun speakIfEnabled(text: String) {
        if (!ttsEnabled || !ttsReady || tts == null) return
        runCatching {
            val locale = if (voiceLang.startsWith("vi")) Locale("vi", "VN") else Locale.US
            tts.language = locale
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "fg-ai-reply")
        }
    }

    fun sendToAi(rawText: String, viaVoice: Boolean = false) {
        val trimmed = rawText.trim()
        if (trimmed.isEmpty() || busy) return
        voiceError = null
        messages.add(
            AiUiMessage(
                id = System.currentTimeMillis(),
                fromUser = true,
                text = trimmed,
                viaVoice = viaVoice,
            ),
        )
        input = ""
        busy = true
        scope.launch {
            try {
                val reply = withContext(Dispatchers.IO) {
                    PlanSyncManager.askAiAssistant(context, trimmed)
                }
                messages.add(
                    AiUiMessage(
                        id = System.currentTimeMillis() + 1L,
                        fromUser = false,
                        text = reply.reply,
                        actionLabel = reply.actionLabel,
                        actionExecuted = reply.actionExecuted,
                    ),
                )
                speakIfEnabled(reply.reply)
                if (reply.shouldRefresh) {
                    onActionMutated()
                }
            } catch (e: Exception) {
                messages.add(
                    AiUiMessage(
                        id = System.currentTimeMillis() + 2L,
                        fromUser = false,
                        text = e.message ?: if (isVi) "Không thể kết nối FocusGate AI." else "Could not reach FocusGate AI.",
                    ),
                )
            } finally {
                busy = false
            }
        }
    }

    val speechLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val matches = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            val spoken = matches?.firstOrNull()?.trim().orEmpty()
            if (spoken.isNotEmpty()) {
                sendToAi(spoken, viaVoice = true)
            }
        }
    }

    fun launchVoiceInput() {
        voiceError = null
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, voiceLang)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, voiceLang)
            putExtra(
                RecognizerIntent.EXTRA_PROMPT,
                if (isVi) "Nói lệnh cho FocusGate AI..." else "Speak a command for FocusGate AI...",
            )
        }
        runCatching {
            speechLauncher.launch(intent)
        }.onFailure {
            voiceError = if (isVi) {
                "Thiết bị chưa cài dịch vụ nhận diện giọng nói (Google Speech)."
            } else {
                "No system speech recognition service found on this device."
            }
        }
    }

    val quickPrompts = if (isVi) {
        listOf(
            "Hôm nay còn gì?" to "Hôm nay còn gì?",
            "Tập trung 25p" to "Bắt đầu tập trung 25 phút",
            "Việc tiếp theo" to "Làm gì tiếp theo?",
            "Mở khóa 10p" to "Mở khóa 10 phút giải trí",
        )
    } else {
        listOf(
            "Today's status" to "Today's status",
            "Focus 25m" to "Start focus 25 minutes",
            "Next move" to "What's next?",
            "Unlock 10m" to "Unlock 10 minutes pass",
        )
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AiKeystoneLogo(size = 34.dp)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(
                        text = "FocusGate AI",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Web · PC · Android",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = { voiceLang = if (voiceLang == "vi-VN") "en-US" else "vi-VN" },
                ) {
                    Text(if (voiceLang == "vi-VN") "VI" else "EN", style = MaterialTheme.typography.labelSmall)
                }
                OutlinedButton(
                    onClick = {
                        ttsEnabled = !ttsEnabled
                        if (!ttsEnabled) runCatching { tts?.stop() }
                    },
                ) {
                    Text(if (ttsEnabled) "🔊" else "🔇", style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Message list
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 180.dp, max = 300.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(messages, key = { it.id }) { msg ->
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = if (msg.fromUser) Alignment.End else Alignment.Start,
                ) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = if (msg.fromUser) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                    ) {
                        Text(
                            text = if (msg.viaVoice) "🎙️ ${msg.text}" else msg.text,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (msg.fromUser) {
                                MaterialTheme.colorScheme.onPrimary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                    if (!msg.actionLabel.isNullOrBlank()) {
                        Spacer(Modifier.height(3.dp))
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(
                                    if (msg.actionExecuted) Color(0x2210B981) else Color(0x22F59E0B),
                                )
                                .padding(horizontal = 8.dp, vertical = 2.dp),
                        ) {
                            Text(
                                text = (if (msg.actionExecuted) "✓ " else "• ") + msg.actionLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (msg.actionExecuted) Color(0xFF10B981) else Color(0xFFD97706),
                            )
                        }
                    }
                }
            }
        }

        if (busy) {
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Text(
                    text = if (isVi) "Đang thực thi & đồng bộ..." else "Executing & syncing...",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (!voiceError.isNullOrBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(
                text = voiceError.orEmpty(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        Spacer(Modifier.height(10.dp))

        // Quick chips
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            quickPrompts.forEach { (label, prompt) ->
                FilledTonalButton(
                    onClick = { sendToAi(prompt, viaVoice = false) },
                    enabled = !busy,
                ) {
                    Text(label, style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // Input + Voice Mic + Send
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilledTonalButton(
                onClick = { launchVoiceInput() },
                enabled = !busy,
            ) {
                Text("🎙️", style = MaterialTheme.typography.titleMedium)
            }
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                enabled = !busy,
                placeholder = {
                    Text(
                        if (isVi) "Nhập hoặc bấm 🎙️ để nói..." else "Type or tap 🎙️ to speak...",
                        style = MaterialTheme.typography.bodySmall,
                    )
                },
            )
            Button(
                onClick = { sendToAi(input, viaVoice = false) },
                enabled = !busy && input.isNotBlank(),
            ) {
                Text(if (isVi) "Gửi" else "Send")
            }
        }

        Spacer(Modifier.height(18.dp))
    }
}
