"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AiLogoMark } from "@/components/ui/ai-logo";
import { useLocale } from "@/components/i18n/language-provider";
import type { AiChatResponse } from "@/lib/domain/ai-assistant";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  viaVoice?: boolean;
  actionLabel?: string | null;
  actionExecuted?: boolean;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

const VOICE_TTS_STORAGE_KEY = "focusgate_ai_tts_enabled";
const VOICE_LANG_STORAGE_KEY = "focusgate_ai_voice_lang";

export function AiAssistantDrawer() {
  const router = useRouter();
  const isVi = useLocale() === "vi";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"vi-VN" | "en-US">(isVi ? "vi-VN" : "en-US");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: isVi
        ? "Chào bạn! Tôi là FocusGate AI. Bạn có thể gõ hoặc bấm nút Micro để ra lệnh trực tiếp cho Web, Windows PC và Android."
        : "Hi! I'm FocusGate AI. Type or tap the Mic to run live actions across Web, Windows PC, and Android.",
    },
  ]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()));
    try {
      const savedTts = window.localStorage.getItem(VOICE_TTS_STORAGE_KEY);
      if (savedTts === "1") setTtsEnabled(true);
      const savedLang = window.localStorage.getItem(VOICE_LANG_STORAGE_KEY);
      if (savedLang === "vi-VN" || savedLang === "en-US") setVoiceLang(savedLang);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, open]);

  const speakReply = useCallback(
    (text: string) => {
      if (!ttsEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voiceLang;
        utterance.rate = 1.04;
        const voices = window.speechSynthesis.getVoices();
        const match = voices.find((v) => v.lang.toLowerCase().startsWith(voiceLang.slice(0, 2)));
        if (match) utterance.voice = match;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore TTS failure
      }
    },
    [ttsEnabled, voiceLang],
  );

  const sendMessage = useCallback(
    async (rawText: string, viaVoice = false) => {
      const text = rawText.trim();
      if (!text || busy) return;

      const userEntry: ChatEntry = {
        id: `u-${Date.now()}`,
        role: "user",
        text,
        viaVoice,
      };
      setMessages((prev) => [...prev, userEntry]);
      setInput("");
      setVoiceStatus(null);
      setBusy(true);

      try {
        const response = await fetch("/api/agent/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const data = (await response.json()) as AiChatResponse & { error?: string };

        if (!response.ok) {
          throw new Error(data.error || "AI request failed");
        }

        const aiEntry: ChatEntry = {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.reply,
          actionLabel: data.action?.label ?? null,
          actionExecuted: data.action?.executed ?? false,
        };
        setMessages((prev) => [...prev, aiEntry]);
        speakReply(data.reply);

        if (data.shouldRefresh) {
          router.refresh();
        }
      } catch (err) {
        const errorText =
          err instanceof Error
            ? err.message
            : isVi
              ? "Không thể kết nối FocusGate AI."
              : "Could not reach FocusGate AI.";
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text: errorText,
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, isVi, router, speakReply],
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceStatus(
        isVi
          ? "Trình duyệt này chưa hỗ trợ Web Speech API (hãy dùng Chrome hoặc Edge)."
          : "This browser does not support Web Speech API (try Chrome or Edge).",
      );
      return;
    }

    if (listening) {
      stopListening();
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = voiceLang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let latestFinal = "";

      recognition.onstart = () => {
        setListening(true);
        setVoiceStatus(isVi ? "Đang lắng nghe giọng nói..." : "Listening...");
      };

      recognition.onresult = (event) => {
        let interim = "";
        let finalTranscript = "";
        for (let i = 0; i < event.results.length; i += 1) {
          const item = event.results[i];
          const text = item?.[0]?.transcript ?? "";
          if (item?.isFinal) finalTranscript += text;
          else interim += text;
        }
        const combined = (finalTranscript || interim).trim();
        if (combined) setInput(combined);
        if (finalTranscript.trim()) {
          latestFinal = finalTranscript.trim();
        }
      };

      recognition.onerror = (event) => {
        setListening(false);
        const code = event.error ?? "unknown";
        if (code === "not-allowed" || code === "service-not-allowed") {
          setVoiceStatus(
            isVi
              ? "Chưa có quyền Micro. Hãy cho phép Micro trên trình duyệt."
              : "Microphone permission denied. Please allow mic access.",
          );
        } else if (code !== "aborted" && code !== "no-speech") {
          setVoiceStatus(isVi ? `Lỗi thu âm (${code}).` : `Voice error (${code}).`);
        } else {
          setVoiceStatus(null);
        }
      };

      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
        if (latestFinal) {
          void sendMessage(latestFinal, true);
        } else {
          setVoiceStatus(null);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
      setVoiceStatus(
        isVi ? "Không thể khởi động Micro lúc này." : "Could not start microphone.",
      );
    }
  }, [isVi, listening, sendMessage, stopListening, voiceLang]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (event.shiftKey) {
          setOpen(true);
          window.setTimeout(() => startListening(), 120);
        } else {
          setOpen((prev) => !prev);
          window.setTimeout(() => inputRef.current?.focus(), 80);
        }
      } else if (event.key === "Escape" && open) {
        stopListening();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  const toggleTts = () => {
    setTtsEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(VOICE_TTS_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore
      }
      if (!next && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      return next;
    });
  };

  const toggleVoiceLang = () => {
    setVoiceLang((prev) => {
      const next = prev === "vi-VN" ? "en-US" : "vi-VN";
      try {
        window.localStorage.setItem(VOICE_LANG_STORAGE_KEY, next);
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const quickChips = isVi
    ? [
        { label: "Hôm nay còn gì?", prompt: "Hôm nay còn gì?" },
        { label: "Tập trung 25p", prompt: "Bắt đầu tập trung 25 phút" },
        { label: "Làm gì tiếp theo?", prompt: "Làm gì tiếp theo?" },
        { label: "Mở khóa 10p", prompt: "Mở khóa 10 phút giải trí" },
      ]
    : [
        { label: "Today's status", prompt: "Today's status" },
        { label: "Focus 25m", prompt: "Start focus 25 minutes" },
        { label: "What's next?", prompt: "What's next?" },
        { label: "Unlock 10m", prompt: "Unlock 10 minutes pass" },
      ];

  return (
    <>
      {/* Floating Keystone Spark Trigger */}
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          window.setTimeout(() => inputRef.current?.focus(), 80);
        }}
        title={isVi ? "FocusGate AI (Alt+A · Giọng nói Alt+Shift+A)" : "FocusGate AI (Alt+A · Voice Alt+Shift+A)"}
        aria-label="Toggle FocusGate AI assistant"
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full border border-line bg-surface/95 p-1.5 pr-3.5 text-ink shadow-lift backdrop-blur-md transition hover:-translate-y-0.5 hover:border-accent/60 lg:bottom-6 lg:right-6"
      >
        <AiLogoMark size={30} thinking={busy} listening={listening} />
        <span className="text-[12px] font-semibold tracking-tight">
          {listening ? (isVi ? "Đang nghe..." : "Listening...") : "AI"}
        </span>
      </button>

      {/* Interactive Drawer */}
      {open && (
        <section
          aria-label="FocusGate AI Assistant"
          className="fixed bottom-32 right-4 z-50 flex h-[500px] w-[min(92vw,390px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-2xl backdrop-blur-xl lg:bottom-20 lg:right-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line bg-surface-2/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <AiLogoMark size={30} thinking={busy} listening={listening} />
              <div>
                <p className="text-[13px] font-semibold leading-tight text-ink">FocusGate AI</p>
                <p className="text-[10.5px] text-ink-muted">
                  Web · PC · Android · {voiceLang === "vi-VN" ? "VI" : "EN"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleVoiceLang}
                title={isVi ? "Đổi ngôn ngữ giọng nói (VI/EN)" : "Switch voice language (VI/EN)"}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-[10.5px] font-semibold text-ink-soft hover:border-accent/50 hover:text-ink"
              >
                {voiceLang === "vi-VN" ? "VI" : "EN"}
              </button>
              <button
                type="button"
                onClick={toggleTts}
                title={
                  ttsEnabled
                    ? isVi
                      ? "Đang bật đọc phản hồi AI"
                      : "AI voice reply ON"
                    : isVi
                      ? "Bật đọc phản hồi AI bằng giọng nói"
                      : "Enable AI voice reply"
                }
                aria-label="Toggle AI voice output"
                className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                  ttsEnabled
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-line bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                {ttsEnabled ? "🔊" : "🔇"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  setOpen(false);
                }}
                aria-label="Close AI assistant"
                className="rounded-lg px-2 py-1 text-[13px] text-ink-muted hover:bg-surface hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-[12.5px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-accent text-white"
                      : "rounded-bl-sm border border-line bg-surface-2 text-ink"
                  }`}
                >
                  {msg.viaVoice && (
                    <span className="mr-1.5 inline-block text-[10px] opacity-85">🎙️</span>
                  )}
                  {msg.text}
                </div>
                {msg.actionLabel && (
                  <span
                    className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium ${
                      msg.actionExecuted
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {msg.actionExecuted ? "✓" : "•"} {msg.actionLabel}
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-[11.5px] text-ink-muted">
                <span className="size-2 animate-pulse rounded-full bg-accent" />
                {isVi ? "Đang xử lý & đồng bộ..." : "Executing & syncing..."}
              </div>
            )}
            <div ref={listEndRef} />
          </div>

          {/* Quick Chips */}
          <div className="flex flex-wrap gap-1.5 border-t border-line/70 px-3.5 py-2">
            {quickChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={busy}
                onClick={() => void sendMessage(chip.prompt)}
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:border-accent/50 hover:text-ink disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Voice status hint */}
          {voiceStatus && (
            <div className="bg-accent/10 px-4 py-1.5 text-[11px] font-medium text-accent">
              🎙️ {voiceStatus}
            </div>
          )}

          {/* Input + Voice Mic */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input, false);
            }}
            className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2.5"
          >
            <button
              type="button"
              onClick={startListening}
              disabled={busy}
              title={
                voiceSupported
                  ? isVi
                    ? "Bấm để ra lệnh bằng giọng nói (Alt+Shift+A)"
                    : "Tap to speak a command (Alt+Shift+A)"
                  : isVi
                    ? "Trình duyệt chưa hỗ trợ thu âm giọng nói"
                    : "Voice input not supported in this browser"
              }
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl border transition ${
                listening
                  ? "animate-pulse border-accent bg-accent text-white shadow-md"
                  : "border-line bg-surface-2 text-ink-soft hover:border-accent/50 hover:text-ink"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                listening
                  ? isVi
                    ? "Hãy nói lệnh của bạn..."
                    : "Speak your command..."
                  : isVi
                    ? "Nhắn hoặc bấm 🎙️ để nói lệnh..."
                    : "Message or tap 🎙️ to speak..."
              }
              disabled={busy}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />

            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-xl bg-accent px-3 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {isVi ? "Gửi" : "Send"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
