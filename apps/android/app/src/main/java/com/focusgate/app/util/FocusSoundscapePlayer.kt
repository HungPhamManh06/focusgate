package com.focusgate.app.util

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.concurrent.thread
import kotlin.random.Random

object FocusSoundscapePlayer {
    @Volatile
    private var playing = false
    private var workerThread: Thread? = null

    fun isPlaying(): Boolean = playing

    fun toggle(): Boolean {
        if (playing) {
            stop()
        } else {
            start()
        }
        return playing
    }

    fun start() {
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
                while (playing) {
                    for (i in pcm.indices) {
                        val white = Random.nextDouble(-1.0, 1.0)
                        lastOut = (lastOut + 0.02 * white) / 1.02
                        val sample = (lastOut * 14000.0).toInt().coerceIn(-32767, 32767)
                        pcm[i] = sample.toShort()
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
