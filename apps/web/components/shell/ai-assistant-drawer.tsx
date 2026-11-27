"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AiRobotAvatar, type RobotMood } from "@/components/ui/ai-robot-avatar";
import { useLocale } from "@/components/i18n/language-provider";
import { executeWebAiCommands } from "@/lib/client/ai-web-executor";
import {
  isAffirmativeConfirmation,
  type AiChatResponse,
  type AiDeviceCommand,
  type AiPendingConfirmation,
  type AiSummaryCard,
} from "@/lib/domain/ai-assistant";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  viaVoice?: boolean;
  actionLabel?: string | null;
  actionExecuted?: boolean;
  pendingConfirmation?: AiPendingConfirmation | null;
  summaryCard?: AiSummaryCard | null;
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

function getWebViewBridge(): { postMessage: (msg: string) => void } | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    chrome?: { webview?: { postMessage?: (msg: string) => void } };
  };
  const bridge = win.chrome?.webview;
  return bridge && typeof bridge.postMessage === "function"
    ? { postMessage: (msg: string) => bridge.postMessage!(msg) }
    : null;
}

const VOICE_TTS_STORAGE_KEY = "focusgate_ai_tts_enabled";
const VOICE_LANG_STORAGE_KEY = "focusgate_ai_voice_lang";
const FAB_POS_STORAGE_KEY = "focusgate_ai_fab_pos";
const SPOTLIGHT_MODE_STORAGE_KEY = "focusgate_ai_spotlight_mode";

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
  const [spotlightMode, setSpotlightMode] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [proactiveGreeting, setProactiveGreeting] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<AiPendingConfirmation | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: isVi
        ? "Chào bạn! Mình là GateBot — trợ lý đồng hành FocusGate. Bạn có thể kéo mình tới bất kỳ góc nào, nhắn yêu cầu hoặc bấm Micro để nói chuyện nhé!"
        : "Hi there! I'm GateBot — your FocusGate companion. Drag me anywhere, type a request, or tap the Mic to chat!",
    },
  ]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTypingModeRef = useRef(false);
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
    const hasMediaRecorder =
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    setVoiceSupported(
      Boolean(getWebViewBridge()) || Boolean(getSpeechRecognitionCtor()) || hasMediaRecorder,
    );
    try {
      const savedTts = window.localStorage.getItem(VOICE_TTS_STORAGE_KEY);
      if (savedTts === "1") setTtsEnabled(true);
      const savedLang = window.localStorage.getItem(VOICE_LANG_STORAGE_KEY);
      if (savedLang === "vi-VN" || savedLang === "en-US") setVoiceLang(savedLang);
      if (window.localStorage.getItem(SPOTLIGHT_MODE_STORAGE_KEY) === "1") setSpotlightMode(true);
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
    const onDeviceResult = (event: Event) => {
      const detail = (event as CustomEvent<{ ok?: boolean; message?: string }>).detail;
      if (!detail?.message) return;
      setVoiceIsError(!detail.ok);
      setVoiceStatus(`${detail.ok ? "💻 PC:" : "⚠️ PC:"} ${detail.message}`);
    };
    window.addEventListener("focusgate:device-result", onDeviceResult);
    return () => window.removeEventListener("focusgate:device-result", onDeviceResult);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem("focusgate_gatebot_greeted") === "1") return;
    } catch {
      return;
    }
    const showTimer = window.setTimeout(() => {
      const hr = new Date().getHours();
      const msg = isVi
        ? hr < 12
          ? "Chào buổi sáng! Lên 3 việc Bắt buộc cùng mình nhé?"
          : hr < 18
            ? "Chiều rồi! Bấm 1 phiên 25p để giữ nhịp tập trung nhé!"
            : "Buổi tối nhẹ nhàng — hoàn thành nốt việc rồi nghỉ sớm nhé!"
        : hr < 12
          ? "Good morning! Ready to pick today's Must-dos?"
          : hr < 18
            ? "Afternoon check-in — want to run a quick 25m focus?"
            : "Evening wind-down — finish strong and earn your rest!";
      setProactiveGreeting(msg);
      try {
        window.sessionStorage.setItem("focusgate_gatebot_greeted", "1");
      } catch {
        // Ignore storage errors
      }
    }, 2500);

    const hideTimer = window.setTimeout(() => {
      setProactiveGreeting(null);
    }, 9500);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [isVi]);

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
    async (
      rawText: string,
      viaVoice = false,
      confirmOverride?: { confirmUnlock: boolean; pendingCommand: AiDeviceCommand },
    ) => {
      const text = rawText.trim();
      if (!text || busy) return;

      const isConfirming =
        Boolean(confirmOverride) ||
        (Boolean(pendingConfirm) && isAffirmativeConfirmation(text));
      const cmdToConfirm = confirmOverride?.pendingCommand ?? (isConfirming ? pendingConfirm?.command : undefined);

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
      setPendingConfirm(null);
      setBusy(true);

      try {
        const response = await fetch("/api/agent/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            confirmUnlock: isConfirming && Boolean(cmdToConfirm),
            pendingCommand: cmdToConfirm ?? null,
            sourcePlatform: getWebViewBridge() ? "windows" : "web",
          }),
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
          pendingConfirmation: data.pendingConfirmation ?? null,
          summaryCard: data.summaryCard ?? null,
        };
        setMessages((prev) => [...prev, aiEntry]);
        if (data.action?.executed) {
          setCelebrating(true);
          window.setTimeout(() => setCelebrating(false), 2800);
        }
        if (data.pendingConfirmation) {
          setPendingConfirm(data.pendingConfirmation);
        }
        speakReply(data.reply);

        executeWebAiCommands({
          clientCommands: data.clientCommands,
          deviceCommand: data.deviceCommand,
          router,
          shouldRefresh: data.shouldRefresh,
        });
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
    [busy, isVi, pendingConfirm, router, speakReply],
  );

  const stopListening = useCallback(
    (dispatchPending = false) => {
      wantListeningRef.current = false;
      voiceTypingModeRef.current = false;
      clearVoiceTimers();
      const pendingText = transcriptRef.current.trim();
      transcriptRef.current = "";

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore recorder stop errors
        }
        return;
      }

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

  const startMediaRecorderFallback = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setVoiceIsError(true);
      setVoiceStatus(
        isVi
          ? "Trình duyệt không hỗ trợ ghi âm. Trên Windows hãy bấm Win+H trong ô nhập để nói."
          : "Browser does not support audio recording. On Windows, press Win+H inside the input box.",
      );
      inputRef.current?.focus();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        mediaRecorderRef.current = null;
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        setListening(false);

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        if (blob.size < 400) {
          setVoiceStatus(null);
          return;
        }

        setVoiceIsError(false);
        setVoiceStatus(isVi ? "Đang chuyển giọng nói thành chữ..." : "Transcribing voice...");

        try {
          const form = new FormData();
          form.append("audio", blob, "voice.webm");
          form.append("lang", voiceLang);
          const res = await fetch("/api/agent/ai/transcribe", { method: "POST", body: form });
          const data = (await res.json()) as {
            transcript?: string;
            error?: string;
            needsKey?: boolean;
          };
          if (!res.ok) {
            setVoiceIsError(true);
            if (data.needsKey) {
              setVoiceStatus(
                isVi
                  ? "Trình duyệt này chặn Google Speech (lỗi network). Hãy bấm Win+H ngay trong ô nhập để nói miễn phí, hoặc thêm GEMINI_API_KEY / GROQ_API_KEY trên server."
                  : "Browser blocked Google Speech (network). Press Win+H in the input box for free Windows dictation, or configure GEMINI_API_KEY / GROQ_API_KEY.",
              );
              inputRef.current?.focus();
            } else {
              setVoiceStatus(data.error || (isVi ? "Không chuyển được giọng nói." : "Transcription failed."));
            }
            return;
          }
          const text = data.transcript?.trim() ?? "";
          if (text) {
            setVoiceStatus(null);
            setVoiceIsError(false);
            void sendMessage(text, true);
          } else {
            setVoiceStatus(isVi ? "Chưa nghe rõ lệnh. Bấm 🎙️ để nói lại." : "Could not hear clearly. Tap 🎙️ to retry.");
          }
        } catch {
          setVoiceIsError(true);
          setVoiceStatus(isVi ? "Lỗi kết nối khi chuyển giọng nói." : "Network error while transcribing.");
        }
      };

      recorder.start();
      setListening(true);
      setVoiceIsError(false);
      setVoiceStatus(
        isVi
          ? "Đang ghi âm (chế độ dự phòng)... Nói xong bấm 🎙️ để gửi!"
          : "Recording (fallback mode)... Tap 🎙️ again when finished!",
      );
    } catch {
      setVoiceIsError(true);
      setVoiceStatus(
        isVi
          ? "Chưa có quyền Micro. Hãy cho phép Micro trên trình duyệt."
          : "Microphone permission denied. Please allow mic access.",
      );
    }
  }, [isVi, sendMessage, voiceLang]);

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
            // Automatically switch to MediaRecorder fallback so Chromium/Brave/WebView2 users aren't stuck!
            setVoiceIsError(false);
            setVoiceStatus(
              isVi
                ? "Đang chuyển sang ghi âm trực tiếp..."
                : "Switching to direct audio recording...",
            );
            void startMediaRecorderFallback();
            return;
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
    [clearVoiceTimers, isVi, sendMessage, startMediaRecorderFallback, stopListening, voiceLang],
  );

  const startListening = useCallback(async () => {
    if (listening || wantListeningRef.current || voiceTypingModeRef.current) {
      stopListening(true);
      return;
    }

    // Tier 1: Inside FocusGate Windows PC app (WebView2) -> trigger native Windows Voice Typing (Win+H)
    const webViewBridge = getWebViewBridge();
    if (webViewBridge) {
      fatalVoiceErrorRef.current = false;
      voiceTypingModeRef.current = true;
      setListening(true);
      setVoiceIsError(false);
      setVoiceStatus(
        isVi
          ? "Đang bật Windows Voice Typing (Win+H)... Hãy nói lệnh (tự gửi sau 2s ngừng nói)!"
          : "Launching Windows Voice Typing (Win+H)... Speak your command (auto-sends after 2s pause)!",
      );
      inputRef.current?.focus();

      let ackReceived = false;
      const onAck = () => {
        ackReceived = true;
        window.removeEventListener("focusgate:voice-ack", onAck);
      };
      window.addEventListener("focusgate:voice-ack", onAck);
      webViewBridge.postMessage("focusgate_start_voice_typing");

      window.setTimeout(() => {
        window.removeEventListener("focusgate:voice-ack", onAck);
        if (!ackReceived && voiceTypingModeRef.current && !transcriptRef.current.trim()) {
          setVoiceStatus(
            isVi
              ? "Hãy bấm phím Win + H trên bàn phím để nói ngay (hoặc cập nhật bản FocusGate PC mới để tự bật 1 chạm)!"
              : "Press Win + H on your keyboard to speak now (or update FocusGate PC for 1-click auto-launch)!",
          );
          inputRef.current?.focus();
        }
      }, 600);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      await startMediaRecorderFallback();
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
  }, [isVi, launchRecognitionSession, listening, startMediaRecorderFallback, stopListening]);

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
      const rawPos = clampPosition(state.originX + dx, state.originY + dy, state.width, state.height);
      // Magnetic Edge Snap: gently snap to nearest left or right viewport edge
      const snapToLeft = rawPos.x + state.width / 2 < window.innerWidth / 2;
      const snappedX = snapToLeft ? 12 : Math.max(12, window.innerWidth - state.width - 12);
      const finalPos = clampPosition(snappedX, rawPos.y, state.width, state.height);
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
        { icon: "✨", label: "Hôm nay còn gì?", prompt: "Hôm nay còn gì?" },
        { icon: "⏱️", label: "Tập trung 25p", prompt: "Bắt đầu tập trung 25 phút" },
        { icon: "🧭", label: "Làm gì tiếp?", prompt: "Làm gì tiếp theo?" },
        { icon: "🔓", label: "Mở khóa 10p", prompt: "Mở khóa 10 phút giải trí" },
      ]
    : [
        { icon: "✨", label: "Today's status", prompt: "Today's status" },
        { icon: "⏱️", label: "Focus 25m", prompt: "Start focus 25 minutes" },
        { icon: "🧭", label: "What's next?", prompt: "What's next?" },
        { icon: "🔓", label: "Unlock 10m", prompt: "Unlock 10 minutes pass" },
      ];

  const robotMood: RobotMood = listening
    ? "listening"
    : busy
      ? "thinking"
      : voiceIsError
        ? "error"
        : celebrating
          ? "success"
          : "idle";

  const robotStatusText = listening
    ? isVi
      ? "Mình đang nghe đây..."
      : "Listening closely..."
    : busy
      ? isVi
        ? "Để mình xử lý nhé..."
        : "Working on it..."
      : celebrating
        ? isVi
          ? "Xong rồi đó!"
          : "All done!"
        : isVi
          ? "Sẵn sàng giúp bạn"
          : "Ready to help";

  const fabStyle = fabPos
    ? { left: `${fabPos.x}px`, top: `${fabPos.y}px`, right: "auto", bottom: "auto" }
    : undefined;

  return (
    <>
      {/* GateBot Proactive Greeting Whisper */}
      {proactiveGreeting && !open && !dragging && (
        <div
          className="fg-animate-in fixed bottom-[148px] right-4 z-40 flex max-w-[260px] items-start gap-2 rounded-2xl rounded-br-sm border border-line bg-surface/96 px-3.5 py-2.5 text-[11.5px] leading-snug text-ink shadow-lift backdrop-blur-md lg:bottom-[132px] lg:right-6"
          role="status"
        >
          <button
            type="button"
            onClick={() => {
              setProactiveGreeting(null);
              setOpen(true);
              window.setTimeout(() => inputRef.current?.focus(), 80);
            }}
            className="flex-1 text-left transition-colors hover:text-accent"
          >
            {proactiveGreeting}
          </button>
          <button
            type="button"
            onClick={() => setProactiveGreeting(null)}
            aria-label="Dismiss GateBot greeting"
            className="shrink-0 text-[10.5px] text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* Draggable Floating GateBot Companion Trigger */}
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
            ? "Kéo để di chuyển · Bấm để trò chuyện với GateBot (Alt+A · Giọng nói Alt+Shift+A)"
            : "Drag to move · Click to chat with GateBot (Alt+A · Voice Alt+Shift+A)"
        }
        aria-label="Toggle or drag FocusGate GateBot AI companion"
        className={`group fixed z-40 flex touch-none select-none items-center gap-2 rounded-full border border-line bg-surface/96 py-1 pl-1.5 pr-3.5 text-ink shadow-lift backdrop-blur-md transition-all hover:border-accent/60 hover:shadow-xl ${
          fabPos ? "" : "bottom-24 right-4 lg:bottom-20 lg:right-6"
        } ${dragging ? "cursor-grabbing scale-105 border-accent shadow-2xl" : "cursor-grab"}`}
      >
        <AiRobotAvatar
          size={36}
          mood={robotMood}
          className="transition-transform duration-200 group-hover:scale-105"
        />
        <div className="flex flex-col items-start text-left">
          <span className="text-[12px] font-semibold leading-none tracking-tight text-ink">
            {listening ? (isVi ? "Đang nghe..." : "Listening...") : "GateBot"}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[9.5px] font-medium text-muted">
            <span
              className={`size-1.5 rounded-full ${
                listening
                  ? "animate-pulse bg-accent"
                  : busy
                    ? "animate-pulse bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
            {isVi ? "Trợ lý AI" : "AI Buddy"}
          </span>
        </div>
      </button>

      {/* Interactive Drawer / Center Spotlight */}
      {open && spotlightMode && (
        <div
          aria-hidden="true"
          onClick={() => {
            stopListening(false);
            setOpen(false);
          }}
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
        />
      )}
      {open && (
        <section
          aria-label="FocusGate GateBot AI Companion"
          className={
            spotlightMode
              ? "fixed left-1/2 top-1/2 z-50 flex h-[min(82vh,580px)] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[24px] border border-line bg-surface/96 shadow-2xl backdrop-blur-xl"
              : "fixed bottom-24 right-4 z-50 flex h-[min(78vh,530px)] w-[min(92vw,405px)] flex-col overflow-hidden rounded-[24px] border border-line bg-surface/96 shadow-2xl backdrop-blur-xl lg:bottom-20 lg:right-6"
          }
        >
          {/* Friendly Robot Header */}
          <div className="relative flex items-center justify-between border-b border-line bg-gradient-to-r from-surface-2/90 via-surface-2/70 to-accent-soft/30 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-line bg-surface shadow-sm">
                <AiRobotAvatar size={36} mood={robotMood} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[13.5px] font-semibold leading-tight text-ink">GateBot</p>
                  <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-accent">
                    AI
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-medium text-muted">
                  <span
                    className={`size-1.5 rounded-full ${
                      listening
                        ? "animate-pulse bg-accent"
                        : busy
                          ? "animate-pulse bg-amber-500"
                          : celebrating
                            ? "bg-emerald-500"
                            : "bg-emerald-500"
                    }`}
                  />
                  <span>{robotStatusText}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSpotlightMode((prev) => {
                    const next = !prev;
                    try {
                      window.localStorage.setItem(SPOTLIGHT_MODE_STORAGE_KEY, next ? "1" : "0");
                    } catch {
                      // Ignore
                    }
                    return next;
                  });
                }}
                title={
                  spotlightMode
                    ? isVi
                      ? "Thu về góc màn hình"
                      : "Dock to corner"
                    : isVi
                      ? "Mở rộng giữa màn hình (Spotlight)"
                      : "Center Spotlight mode"
                }
                aria-label="Toggle Spotlight mode"
                className="rounded-lg border border-line bg-surface px-2 py-1 text-[10.5px] font-semibold text-ink-soft hover:border-accent/50 hover:text-ink"
              >
                {spotlightMode ? "⤡" : "⤢"}
              </button>
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
                    : "border-line bg-surface text-muted hover:text-ink"
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
                className="rounded-lg px-2 py-1 text-[13px] text-muted hover:bg-surface hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 text-[12.5px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`flex max-w-[90%] items-end gap-2 ${
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <AiRobotAvatar
                      size={24}
                      mood={msg.actionExecuted ? "success" : "idle"}
                      className="mb-0.5 shrink-0"
                    />
                  )}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-br-sm bg-accent text-white shadow-sm"
                        : "rounded-bl-sm border border-line bg-surface-2/90 text-ink"
                    }`}
                  >
                    {msg.viaVoice && (
                      <span className="mr-1.5 inline-block text-[10px] opacity-85">🎙️</span>
                    )}
                    {msg.text}
                  </div>
                </div>
                {msg.actionLabel && (
                  <span
                    className={`mt-1 ml-8 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium ${
                      msg.actionExecuted
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {msg.actionExecuted ? "✓" : "•"} {msg.actionLabel}
                  </span>
                )}
                {msg.summaryCard && (
                  <div className="mt-1.5 ml-8 w-[84%] rounded-2xl border border-line bg-surface p-3 shadow-sm">
                    <div className="flex items-center justify-between text-[11px] font-medium text-ink-soft">
                      <span>
                        {msg.summaryCard.unlocked
                          ? isVi
                            ? "🔓 Cổng đã mở"
                            : "🔓 Gate unlocked"
                          : isVi
                            ? `🔒 Còn ${msg.summaryCard.mustRemaining} việc Bắt buộc`
                            : `🔒 ${msg.summaryCard.mustRemaining} Must-do left`}
                      </span>
                      <span className="font-semibold text-accent tabular-nums">
                        {msg.summaryCard.walletMinutes}p
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{
                          width: `${
                            msg.summaryCard.total > 0
                              ? Math.round((msg.summaryCard.completed / msg.summaryCard.total) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted">
                        {msg.summaryCard.nextTaskTitle
                          ? `→ ${msg.summaryCard.nextTaskTitle}`
                          : `${msg.summaryCard.completed}/${msg.summaryCard.total} ${isVi ? "hoàn thành" : "done"}`}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void sendMessage(isVi ? "Mở phần tập trung và chạy 25 phút" : "Open focus and run 25m")}
                        className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[10.5px] font-semibold text-accent transition hover:bg-accent hover:text-white"
                      >
                        ▶ {isVi ? "Focus 25p" : "Focus 25m"}
                      </button>
                    </div>
                  </div>
                )}
                {msg.pendingConfirmation && pendingConfirm?.command === msg.pendingConfirmation.command && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void sendMessage(msg.pendingConfirmation!.buttonLabel, false, {
                        confirmUnlock: true,
                        pendingCommand: msg.pendingConfirmation!.command,
                      })
                    }
                    className="mt-1.5 ml-8 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
                  >
                    🔓 {msg.pendingConfirmation.buttonLabel}
                  </button>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-[11.5px] text-muted">
                <AiRobotAvatar size={24} mood="thinking" />
                <span className="rounded-2xl border border-line bg-surface-2 px-3 py-1.5">
                  {isVi ? "GateBot đang xử lý & đồng bộ..." : "GateBot is thinking & syncing..."}
                </span>
              </div>
            )}
            <div ref={listEndRef} />
          </div>

          {/* Friendly Quick Action Chips */}
          <div className="flex flex-wrap gap-1.5 border-t border-line/70 bg-surface-2/40 px-3.5 py-2">
            {quickChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={busy}
                onClick={() => void sendMessage(chip.prompt)}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:border-accent/50 hover:bg-accent-soft/40 hover:text-ink disabled:opacity-50"
              >
                <span aria-hidden="true">{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          {/* Voice status hint + Live Voice Waveform */}
          {(voiceStatus || listening) && (
            <div
              className={`flex items-center gap-2.5 px-4 py-1.5 text-[11px] font-medium ${
                voiceIsError
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-accent/10 text-accent"
              }`}
            >
              {listening && !voiceIsError ? (
                <span className="flex h-3.5 items-end gap-0.5" aria-hidden="true">
                  <span className="w-0.5 animate-pulse rounded-full bg-accent" style={{ height: "45%", animationDelay: "0ms" }} />
                  <span className="w-0.5 animate-pulse rounded-full bg-accent" style={{ height: "100%", animationDelay: "120ms" }} />
                  <span className="w-0.5 animate-pulse rounded-full bg-accent" style={{ height: "65%", animationDelay: "240ms" }} />
                  <span className="w-0.5 animate-pulse rounded-full bg-accent" style={{ height: "90%", animationDelay: "360ms" }} />
                  <span className="w-0.5 animate-pulse rounded-full bg-accent" style={{ height: "50%", animationDelay: "480ms" }} />
                </span>
              ) : (
                <span>🎙️</span>
              )}
              <span className="min-w-0 flex-1">{voiceStatus}</span>
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
              onChange={(e) => {
                const nextVal = e.target.value;
                setInput(nextVal);
                if (voiceTypingModeRef.current && nextVal.trim()) {
                  transcriptRef.current = nextVal.trim();
                  if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
                  silenceTimerRef.current = window.setTimeout(() => {
                    if (voiceTypingModeRef.current && transcriptRef.current.trim()) {
                      stopListening(true);
                    }
                  }, 2_000);
                }
              }}
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
