import { NextResponse } from "next/server";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const audio = formData.get("audio");
  const lang = String(formData.get("lang") || "vi-VN");
  const isoLang = lang.toLowerCase().startsWith("en") ? "en" : "vi";

  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json(
      { error: "Audio clip is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (audio.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Audio clip is too large (max 10MB)." },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }

  // 1. Try Gemini 2.0 Flash native audio transcription if GEMINI_API_KEY is configured
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
      const bytes = Buffer.from(await audio.arrayBuffer());
      const mimeType = audio.type || "audio/webm";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      isoLang === "en"
                        ? "Transcribe this voice command verbatim in English. Return only the spoken text, no quotes or commentary."
                        : "Chép lại chính xác nguyên văn câu nói tiếng Việt này. Chỉ trả về văn bản đã nói, không thêm dấu ngoặc hay giải thích.",
                  },
                  {
                    inlineData: {
                      mimeType,
                      data: bytes.toString("base64"),
                    },
                  },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 200, temperature: 0 },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        return NextResponse.json(
          { transcript, provider: "gemini" },
          { headers: NO_STORE_HEADERS },
        );
      }
    } catch {
      // Fall through
    }
  }

  // 2. Try Groq Whisper or OpenAI Whisper if configured
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const whisperKey = groqKey || openaiKey;
  if (whisperKey) {
    try {
      const endpoint = groqKey
        ? "https://api.groq.com/openai/v1/audio/transcriptions"
        : "https://api.openai.com/v1/audio/transcriptions";
      const model = groqKey ? "whisper-large-v3-turbo" : "whisper-1";
      const upload = new FormData();
      upload.append("file", audio, "voice.webm");
      upload.append("model", model);
      upload.append("language", isoLang);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${whisperKey}` },
        body: upload,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        return NextResponse.json(
          { transcript: data.text?.trim() ?? "", provider: groqKey ? "groq" : "openai" },
          { headers: NO_STORE_HEADERS },
        );
      }
    } catch {
      // Fall through
    }
  }

  return NextResponse.json(
    {
      error: "No server speech-to-text key configured.",
      needsKey: true,
    },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}
