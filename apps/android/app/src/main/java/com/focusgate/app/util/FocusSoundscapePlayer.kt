package com.focusgate.app.util

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

enum class SoundscapeMode(
    val labelEn: String,
    val labelVi: String,
) {
    BROWN("Brown", "Ồn nâu"),
    PINK("Pink", "Ồn hồng"),
    RAIN("Rain", "Tiếng mưa"),
    OCEAN("Ocean", "Sóng biển"),
    AMBIENT("Ambient", "Nhạc êm"),
}

object FocusSoundscapePlayer {
    @Volatile
    private var playing = false

    @Volatile
    private var currentMode = SoundscapeMode.BROWN
    private var workerThread: Thread? = null

    fun isPlaying(): Boolean = playing

    fun getMode(): SoundscapeMode = currentMode

    fun setMode(mode: SoundscapeMode) {
        val changed = currentMode != mode
        currentMode = mode
        if (playing && changed) {
            stop()
            start(mode)
        }
    }

    fun toggle(mode: SoundscapeMode = currentMode): Boolean {
        if (playing) {
            stop()
        } else {
            start(mode)
        }
        return playing
    }

    fun start(mode: SoundscapeMode = currentMode) {
        currentMode = mode
        if (playing) return
        playing = true
        workerThread = thread(start = true, isDaemon = true, name = "FocusSoundscape") {
            val sampleRate = 22050
            val bufferSamples = 2048
            val minBuf = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            ).coerceAtLeast(bufferSamples * 2)

            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build(),
                )
                .setBufferSizeInBytes(minBuf)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()

            try {
                track.play()
                val pcm = ShortArray(bufferSamples)
                var lastOut = 0.0
                var b0 = 0.0
                var b1 = 0.0
                var b2 = 0.0
                var dropEnv = 0.0
                var sampleIndex = 0L

                while (playing) {
                    val activeMode = currentMode
                    for (i in pcm.indices) {
                        val white = Random.nextDouble(-1.0, 1.0)
                        val normalized = when (activeMode) {
                            SoundscapeMode.BROWN -> {
                                lastOut = (lastOut + 0.02 * white) / 1.02
                                lastOut * 1.4
                            }
                            SoundscapeMode.PINK -> {
                                b0 = 0.99765 * b0 + white * 0.0990460
                                b1 = 0.96300 * b1 + white * 0.2965164
                                b2 = 0.57000 * b2 + white * 1.0526913
                                (b0 + b1 + b2 + white * 0.1848) * 0.14
                            }
                            SoundscapeMode.RAIN -> {
                                b0 = 0.99765 * b0 + white * 0.0990460
                                b1 = 0.96300 * b1 + white * 0.2965164
                                val bed = (b0 + b1 + white * 0.22) * 0.14
                                if (Random.nextDouble() < 0.0014) {
                                    dropEnv = 0.25 + Random.nextDouble() * 0.25
                                } else {
                                    dropEnv *= 0.992
                                }
                                bed + white * dropEnv * 0.4
                            }
                            SoundscapeMode.OCEAN -> {
                                lastOut = (lastOut + 0.03 * white) / 1.03
                                val tSec = sampleIndex / sampleRate.toDouble()
                                val swell = 0.45 + 0.45 * sin(2.0 * PI * 0.11 * tSec)
                                lastOut * 1.6 * swell
                            }
                            SoundscapeMode.AMBIENT -> {
                                val tSec = sampleIndex / sampleRate.toDouble()
                                val tone = (
                                    sin(2.0 * PI * 174.61 * tSec) +
                                        sin(2.0 * PI * 220.0 * tSec) +
                                        sin(2.0 * PI * 261.63 * tSec) +
                                        sin(2.0 * PI * 329.63 * tSec)
                                    ) * 0.06
                                val breath = 0.75 + 0.25 * sin(2.0 * PI * 0.15 * tSec)
                                tone * breath
                            }
                        }
                        sampleIndex += 1
                        pcm[i] = (normalized * 12000.0).toInt().coerceIn(-32767, 32767).toShort()
                    }
                    track.write(pcm, 0, pcm.size)
                }
            } catch (_: Throwable) {
                // Ignore audio hardware interruptions.
            } finally {
                runCatching { track.stop() }
                runCatching { track.release() }
                playing = false
            }
        }
    }

    fun stop() {
        playing = false
        workerThread = null
    }
}
