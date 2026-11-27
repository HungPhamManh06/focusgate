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

interface FabPosition {
  x: number;
  y: number;
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
const FAB_POS_STORAGE_KEY = "focusgate_ai_fab_pos";

function clampPosition(x: number, y: number, width = 88, height = 46): FabPosition {
  if (typeof window === "undefined") return { x, y };
  const margin = 10;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

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
  const [voiceIsError, setVoiceIsError] = useState(false);
  const [fabPos, setFabPos] = useState<FabPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: isVi
        ? "Chào bạn! Tôi là FocusGate AI. Bạn có thể kéo thả biểu tượng AI đến bất kỳ đâu, gõ lệnh hoặc bấm nút Micro để ra lệnh bằng giọng nói."
        : "Hi! I'm FocusGate AI. Drag the AI icon anywhere on screen, type a command, or tap the Mic to speak.",
    },
  ]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const fatalVoiceErrorRef = useRef(false);
  const transcriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const idleTimeoutRef = useRef<number | null>(null);
  const restartCountRef = useRef(0);

  const fabRef = useRef<HTMLButtonElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    moved: boolean;
  } | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()));
    try {
      const savedTts = window.localStorage.getItem(VOICE_TTS_STORAGE_KEY);
      if (savedTts === "1") setTtsEnabled(true);
      const savedLang = window.localStorage.getItem(VOICE_LANG_STORAGE_KEY);
      if (savedLang === "vi-VN" || savedLang === "en-US") setVoiceLang(savedLang);
      const savedPos = window.localStorage.getItem(FAB_POS_STORAGE_KEY);
      if (savedPos) {
        const parsed = JSON.parse(savedPos) as Partial<FabPosition>;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setFabPos(clampPosition(parsed.x, parsed.y));
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  useEffect(() => {
    const onResize = () => {
      setFabPos((prev) => {
        if (!prev) return prev;
        const rect = fabRef.current?.getBoundingClientRect();
        return clampPosition(prev.x, prev.y, rect?.width ?? 88, rect?.height ?? 46);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, open]);

  const clearVoiceTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (idleTimeoutRef.current !== null) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

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
      setVoiceIsError(false);
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

  const stopListening = useCallback(
    (dispatchPending = false) => {
      wantListeningRef.current = false;
      clearVoiceTimers();
      const pendingText = transcriptRef.current.trim();
      transcriptRef.current = "";

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore stop errors
        }
        recognitionRef.current = null;
      }
      setListening(false);
      if (!fatalVoiceErrorRef.current) {
        setVoiceStatus(null);
        setVoiceIsError(false);
      }
      if (dispatchPending && pendingText) {
        void sendMessage(pendingText, true);
      }
    },
    [clearVoiceTimers, sendMessage],
  );

  const launchRecognitionSession = useCallback(
    (Ctor: SpeechRecognitionCtor) => {
      try {
        const recognition = new Ctor();
        recognition.lang = voiceLang;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setListening(true);
          setVoiceIsError(false);
          setVoiceStatus(
            isVi
              ? "Đang lắng nghe... Hãy nói lệnh (tự gửi sau 2s im lặng hoặc bấm 🎙️ để gửi ngay)"
              : "Listening... Speak your command (auto-sends after 2s pause or tap 🎙️)",
          );
          if (idleTimeoutRef.current !== null) window.clearTimeout(idleTimeoutRef.current);
          idleTimeoutRef.current = window.setTimeout(() => {
            if (wantListeningRef.current && !transcriptRef.current.trim()) {
              stopListening(false);
              setVoiceIsError(false);
              setVoiceStatus(
                isVi ? "Chưa nghe thấy giọng nói. Bấm 🎙️ để thử lại." : "No speech detected. Tap 🎙️ to retry.",
              );
            }
          }, 15_000);
        };

        recognition.onresult = (event) => {
          restartCountRef.current = 0;
          let fullTranscript = "";
          for (let i = 0; i < event.results.length; i += 1) {
            const item = event.results[i];
            const text = item?.[0]?.transcript ?? "";
            if (text) fullTranscript += `${text} `;
          }
          const combined = fullTranscript.trim();
          if (combined) {
            transcriptRef.current = combined;
            setInput(combined);
            setVoiceStatus(isVi ? `Đang nghe: "${combined}"` : `Hearing: "${combined}"`);
            setVoiceIsError(false);

            if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = window.setTimeout(() => {
              if (wantListeningRef.current && transcriptRef.current.trim()) {
                stopListening(true);
              }
            }, 2_000);
          }
        };

        recognition.onerror = (event) => {
          const code = event.error ?? "unknown";
          if (code === "no-speech") {
            // Do not terminate on brief silence; onend will keep listening while wantListeningRef is true.
            return;
          }
          if (code === "aborted" && !wantListeningRef.current) {
            return;
          }

          fatalVoiceErrorRef.current = true;
          wantListeningRef.current = false;
          clearVoiceTimers();
          setListening(false);
          setVoiceIsError(true);

          if (code === "not-allowed" || code === "service-not-allowed") {
            setVoiceStatus(
              isVi
                ? "Trình duyệt chưa cấp quyền Micro. Hãy bấm biểu tượng ổ khóa trên thanh địa chỉ để cho phép Micro."
                : "Microphone permission denied. Allow mic access in your browser settings.",
            );
          } else if (code === "audio-capture") {
            setVoiceStatus(
              isVi
                ? "Không tìm thấy thiết bị Micro. Hãy kiểm tra tai nghe/mic của máy."
                : "No microphone hardware detected. Check your audio input device.",
            );
          } else if (code === "network") {
            setVoiceStatus(
              isVi
                ? "Trình duyệt không kết nối được dịch vụ giọng nói (lỗi network). Trên Windows hãy bấm Win+H trong ô nhập để nói bằng Windows Voice Typing."
                : "Browser speech service unreachable (network). On Windows, press Win+H inside the input box for Windows Voice Typing.",
            );
            inputRef.current?.focus();
          } else {
            setVoiceStatus(isVi ? `Lỗi thu âm (${code}).` : `Voice error (${code}).`);
          }
        };

        recognition.onend = () => {
          recognitionRef.current = null;
          if (fatalVoiceErrorRef.current) {
            setListening(false);
            return;
          }
          // If the user already spoke and browser ended the session, send immediately.
          if (transcriptRef.current.trim() && !wantListeningRef.current) {
            const text = transcriptRef.current.trim();
            transcriptRef.current = "";
            setListening(false);
            void sendMessage(text, true);
            return;
          }
          // Keep listening seamlessly if the browser dropped after ~1s of silence before user finished!
          if (wantListeningRef.current && restartCountRef.current < 6) {
            restartCountRef.current += 1;
            window.setTimeout(() => {
              if (wantListeningRef.current && !fatalVoiceErrorRef.current) {
                launchRecognitionSession(Ctor);
              }
            }, 180);
            return;
          }
          wantListeningRef.current = false;
          clearVoiceTimers();
          setListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        fatalVoiceErrorRef.current = true;
        wantListeningRef.current = false;
        clearVoiceTimers();
        setListening(false);
        setVoiceIsError(true);
        setVoiceStatus(
          isVi ? "Không thể khởi động Micro lúc này." : "Could not start microphone.",
        );
      }
    },
    [clearVoiceTimers, isVi, sendMessage, stopListening, voiceLang],
  );

  const startListening = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceIsError(true);
      setVoiceStatus(
        isVi
          ? "Trình duyệt chưa hỗ trợ Web Speech API. Hãy dùng Chrome/Edge hoặc bấm Win+H trong ô nhập."
          : "Web Speech API not supported here. Use Chrome/Edge or press Win+H in the input box.",
      );
      return;
    }

    if (listening || wantListeningRef.current) {
      stopListening(true);
      return;
    }

    fatalVoiceErrorRef.current = false;
    transcriptRef.current = "";
    restartCountRef.current = 0;
    setVoiceIsError(false);

    // Warm up microphone permission via MediaDevices first so Chrome/Edge prompts cleanly instead of aborting in 1s.
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        fatalVoiceErrorRef.current = true;
        setVoiceIsError(true);
        setVoiceStatus(
          isVi
            ? "Chưa có quyền Micro. Hãy cho phép Micro rồi bấm 🎙️ lại."
            : "Microphone permission is required. Please allow mic access and tap 🎙️ again.",
        );
        return;
      }
    }

    wantListeningRef.current = true;
    launchRecognitionSession(Ctor);
  }, [isVi, launchRecognitionSession, listening, stopListening]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (event.shiftKey) {
          setOpen(true);
          window.setTimeout(() => void startListening(), 120);
        } else {
          setOpen((prev) => !prev);
          window.setTimeout(() => inputRef.current?.focus(), 80);
        }
      } else if (event.key === "Escape" && open) {
        stopListening(false);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, startListening, stopListening]);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      clearVoiceTimers();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [clearVoiceTimers]);

  const handleFabPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
  };

  const handleFabPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) > 6) {
      state.moved = true;
      setDragging(true);
    }
    if (state.moved) {
      setFabPos(clampPosition(state.originX + dx, state.originY + dy, state.width, state.height));
    }
  };

  const handleFabPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release errors
    }
    dragStateRef.current = null;
    setDragging(false);

    if (state.moved) {
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const finalPos = clampPosition(state.originX + dx, state.originY + dy, state.width, state.height);
      setFabPos(finalPos);
      try {
        window.localStorage.setItem(FAB_POS_STORAGE_KEY, JSON.stringify(finalPos));
      } catch {
        // Ignore storage errors
      }
    } else {
      setOpen((prev) => !prev);
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  };

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

  const fabStyle = fabPos
    ? { left: `${fabPos.x}px`, top: `${fabPos.y}px`, right: "auto", bottom: "auto" }
    : undefined;

  return (
    <>
      {/* Draggable Floating Keystone Spark Trigger */}
      <button
        ref={fabRef}
        type="button"
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        onPointerCancel={() => {
          dragStateRef.current = null;
          setDragging(false);
        }}
        style={fabStyle}
        title={
          isVi
            ? "Kéo để di chuyển · Bấm để mở FocusGate AI (Alt+A · Giọng nói Alt+Shift+A)"
            : "Drag to move · Click to open FocusGate AI (Alt+A · Voice Alt+Shift+A)"
        }
        aria-label="Toggle or drag FocusGate AI assistant"
        className={`fixed z-40 flex touch-none select-none items-center gap-2 rounded-full border border-line bg-surface/95 p-1.5 pr-3.5 text-ink shadow-lift backdrop-blur-md hover:border-accent/60 ${
          fabPos ? "" : "bottom-24 right-4 lg:bottom-20 lg:right-6"
        } ${dragging ? "cursor-grabbing scale-105 border-accent shadow-2xl" : "cursor-grab transition-shadow"}`}
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
          className="fixed bottom-24 right-4 z-50 flex h-[min(78vh,510px)] w-[min(92vw,395px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-2xl backdrop-blur-xl lg:bottom-20 lg:right-6"
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
                  stopListening(false);
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
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-amber-500/15 text-amber-500"
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
            <div
              className={`px-4 py-1.5 text-[11px] font-medium ${
                voiceIsError
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-accent/10 text-accent"
              }`}
            >
              🎙️ {voiceStatus}
            </div>
          )}

          {/* Input + Voice Mic */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (listening) {
                stopListening(false);
              }
              void sendMessage(input, false);
            }}
            className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2.5"
          >
            <button
              type="button"
              onClick={() => void startListening()}
              disabled={busy}
              title={
                voiceSupported
                  ? listening
                    ? isVi
                      ? "Đang nghe — bấm để dừng và gửi ngay"
                      : "Listening — tap to stop and send now"
                    : isVi
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
