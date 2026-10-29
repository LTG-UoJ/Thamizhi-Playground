const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export type Locale = "en" | "ta-LK";
function generateIdempotencyKey(): string {
  // Modern browsers
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback for browsers/environments without crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    },
  );
}

export type ModuleId = "chat" | "tts" | "asr" | "ocr" | "completion";

export type RecordPreferences = {
  saveHistory: boolean;
  improvementConsent: boolean;
};

export type ModuleDescriptor = {
  module_id: ModuleId | string;
  descriptor_version: string;
  capability: string;
  route_slug: string;
  navigation_group: string;
  title_key: string;
  description_key: string;
  icon_key: string;
  sort_order: number;
  enabled: boolean;
  renderer_kind: "compiled_custom" | "standard_form";
  provider_capability: string;
};

export type Interaction = {
  interaction_id: string;
  module_id: ModuleId;
  query_text?: string;
  answer_text?: string;
  provider_id?: string;
  model_id?: string;
  language: Locale;
  status: string;
  improvement_consent: number;
  created_at: string;
};

export type UsageSummary = {
  totals: {
    requests: number;
    successful: number;
    errors: number;
    average_latency_ms: number;
  };
  rows: Array<{
    route: string;
    requests: number;
    successful: number;
    errors: number;
    average_latency_ms: number;
    last_used_at: string;
  }>;
  generated_at: string;
};

export type ExperienceFeedback = {
  rating?: number;
  task_outcome?: "yes" | "partly" | "no";
  module_ids: ModuleId[];
  comment?: string;
  follow_up_allowed: boolean;
  locale: Locale;
};

type ApiError = { error?: { code?: string; message?: string } };

const authHeaders = (consented = true): HeadersInit => ({
  "X-User-ID": "local-demo-user",
  "X-Consent-Granted": String(consented),
  "X-Roles": "user",
});

const recordHeaders = (preferences: RecordPreferences): HeadersInit => ({
  "X-Save-History": String(preferences.saveHistory),
  "X-Improvement-Consent": String(preferences.improvementConsent),
});

async function checked<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data = (await response.json()) as T & ApiError;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Request failed (${response.status})`);
  }
  return data;
}

export async function getModules() {
  return checked<{ modules: ModuleDescriptor[]; catalogue_version: string }>(
    await fetch(`${API_BASE}/modules`, { headers: authHeaders(false), cache: "no-store" }),
  );
}

export async function createTTS(
  text: string,
  language: Locale,
  voice: "male" | "female",
  consented: boolean,
  preferences: RecordPreferences,
  referenceWav?: File,
) {
  if (referenceWav) {
    const body = new FormData();
    body.append("text", text);
    body.append("language", language);
    body.append("voice", voice);
    body.append("reference_wav", referenceWav);
    return checked<{ job_id: string; status_url: string }>(
      await fetch(`${API_BASE}/tts/jobs/upload`, {
        method: "POST",
        headers: {
          ...authHeaders(consented),
          ...recordHeaders(preferences),
          "Idempotency-Key": generateIdempotencyKey(),
        },
        body,
      }),
    );
  }
  return checked<{ job_id: string; status_url: string }>(
    await fetch(`${API_BASE}/tts/jobs`, {
      method: "POST",
      headers: {
        ...authHeaders(consented),
        ...recordHeaders(preferences),
        "Content-Type": "application/json",
        "Idempotency-Key": generateIdempotencyKey(),
      },
      body: JSON.stringify({
        text,
        language,
        voice,
        voice_id: "default",
        speaking_rate: 1.0,
        output_format: "wav",
      }),
    }),
  );
}

export type ASRSessionResult = {
  session_id: string;
  status: string;
  stream_url: string;
  provider_id: string;
};

export async function createASRSession(
  language: Locale,
  consented: boolean,
) {
  return checked<ASRSessionResult>(
    await fetch(`${API_BASE}/asr/sessions`, {
      method: "POST",
      headers: { ...authHeaders(consented), "Content-Type": "application/json" },
      body: JSON.stringify({ language: language === "ta-LK" ? "ta-LK" : "en", mode: "live" }),
    }),
  );
}

export function getASRWebSocketUrl(streamUrl: string, consented: boolean): string {
  if (typeof window === "undefined") return "";
  let baseHost: string;
  let isSecure: boolean;
  if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
    const parsed = new URL(API_BASE);
    baseHost = parsed.host;
    isSecure = parsed.protocol === "https:";
  } else {
    baseHost = window.location.host;
    isSecure = window.location.protocol === "https:";
  }
  const protocol = isSecure ? "wss:" : "ws:";
  const cleanPath = streamUrl.startsWith("/") ? streamUrl : `/${streamUrl}`;
  return `${protocol}//${baseHost}${cleanPath}?consent=${consented}`;
}

export async function transcribe(
  audio: Blob,
  language: Locale,
  consented: boolean,
  preferences: RecordPreferences,
) {
  const body = new FormData();
  body.append("audio", audio, "recording.webm");
  body.append("language", language);
  return checked<{ text: string; provider_id: string; interaction_id?: string }>(
    await fetch(`${API_BASE}/asr/transcriptions`, {
      method: "POST",
      headers: { ...authHeaders(consented), ...recordHeaders(preferences) },
      body,
    }),
  );
}

export async function chat(
  content: string,
  language: Locale,
  consented: boolean,
  preferences: RecordPreferences,
) {
  return checked<{
    message: { content: string };
    provider_id: string;
    model_id: string;
    interaction_id?: string;
  }>(
    await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        ...authHeaders(consented),
        ...recordHeaders(preferences),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language,
        stream: false,
        messages: [{ role: "user", content }],
      }),
    }),
  );
}

export type CompletionResult = {
  request_id: string;
  text: string;
  provider_id: string;
  model_id: string;
  interaction_id?: string;
};

export async function complete(
  text: string,
  consented: boolean,
  preferences: RecordPreferences,
  model?: string,
) {
  return checked<CompletionResult>(
    await fetch(`${API_BASE}/completion/completions`, {
      method: "POST",
      headers: {
        ...authHeaders(consented),
        ...recordHeaders({ ...preferences, saveHistory: true }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, ...(model ? { model } : {}) }),
    }),
  );
}

export async function createOCR(
  image: File,
  language: Locale,
  consented: boolean,
  preferences: RecordPreferences,
) {
  const body = new FormData();
  body.append("image", image);
  body.append("language", language);
  return checked<{ job_id: string; status_url: string }>(
    await fetch(`${API_BASE}/ocr/jobs`, {
      method: "POST",
      headers: {
        ...authHeaders(consented),
        ...recordHeaders(preferences),
        "Idempotency-Key": generateIdempotencyKey(),
      },
      body,
    }),
  );
}

export async function waitForJob<T>(jobId: string, timeoutMs = 30_000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await checked<{ status: string; result?: T; error?: { message: string } }>(
      await fetch(`${API_BASE}/jobs/${jobId}`, { headers: authHeaders() }),
    );
    if (job.status === "completed" && job.result) return job.result;
    if (job.status === "failed") throw new Error(job.error?.message ?? "Job failed");
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("The job did not complete before the client deadline.");
}

export async function loadArtifact(path: string): Promise<string> {
  const response = await fetch(`${API_BASE.replace(/\/api\/v1$/, "")}${path}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error("Could not load generated audio.");
  return URL.createObjectURL(await response.blob());
}

export async function getUsage(moduleId?: string) {
  const search = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
  return checked<UsageSummary>(
    await fetch(`${API_BASE}/usage/summary${search}`, {
      headers: authHeaders(false),
      cache: "no-store",
    }),
  );
}

export async function downloadUsage(moduleId?: string) {
  const search = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
  const response = await fetch(`${API_BASE}/usage/export.csv${search}`, {
    headers: authHeaders(false),
  });
  if (!response.ok) throw new Error("Could not download usage data.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "thamizhi-usage.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export async function getActivity(moduleId?: string) {
  const search = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
  return checked<{ interactions: Interaction[] }>(
    await fetch(`${API_BASE}/activity/me${search}`, {
      headers: authHeaders(false),
      cache: "no-store",
    }),
  );
}

export async function deleteActivity(interactionId: string) {
  return checked<void>(
    await fetch(`${API_BASE}/activity/me/${interactionId}`, {
      method: "DELETE",
      headers: authHeaders(false),
    }),
  );
}

export async function rateInteraction(
  interactionId: string,
  rating: "helpful" | "not_helpful",
) {
  return checked<{ status: string }>(
    await fetch(`${API_BASE}/interactions/${interactionId}/feedback`, {
      method: "POST",
      headers: { ...authHeaders(false), "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    }),
  );
}

export async function submitExperienceFeedback(feedback: ExperienceFeedback) {
  return checked<{ status: string }>(
    await fetch(`${API_BASE}/feedback/experience`, {
      method: "POST",
      headers: { ...authHeaders(false), "Content-Type": "application/json" },
      body: JSON.stringify({ ...feedback, client_version: "web-0.2.0" }),
    }),
  );
}

export async function logout() {
  return checked<{ status: string }>(
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: authHeaders(false),
    }),
  );
}

// ── CeyNews tools ────────────────────────────────────────────────────────────

export type NewsClassificationResult = {
  request_id: string;
  category: string;
  provider_id: string;
  model_id: string;
  interaction_id?: string;
};

export type NewsHeadlineResult = {
  request_id: string;
  headline: string;
  provider_id: string;
  model_id: string;
  interaction_id?: string;
};

export async function classifyNews(
  text: string,
  preferences?: RecordPreferences,
): Promise<NewsClassificationResult> {
  return checked<NewsClassificationResult>(
    await fetch(`${API_BASE}/news/classify`, {
      method: "POST",
      headers: {
        ...authHeaders(true),
        ...(preferences ? recordHeaders({ ...preferences, saveHistory: true }) : { "X-Save-History": "true" }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    }),
  );
}

export async function generateNewsHeadline(
  text: string,
  preferences?: RecordPreferences,
): Promise<NewsHeadlineResult> {
  return checked<NewsHeadlineResult>(
    await fetch(`${API_BASE}/news/generate-headline`, {
      method: "POST",
      headers: {
        ...authHeaders(true),
        ...(preferences ? recordHeaders({ ...preferences, saveHistory: true }) : { "X-Save-History": "true" }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    }),
  );
}


// ============================================================================
// ThamizhiOCR — browser -> Next.js proxy -> OCR backend
// ============================================================================

export type ThamizhiOCRResult = {
  session_id: string;
  ocr_text: string;
  annotated_image_url: string;
  download_docx_url: string;
};

export async function processThamizhiOCR(
  file: File,
): Promise<ThamizhiOCRResult> {
  const body = new FormData();
  body.append("file", file);

  // IMPORTANT:
  // Browser talks ONLY to Next.js.
  // Next.js talks to the OCR backend.
  const response = await fetch("/playground/api/ocr/process", {
    method: "POST",
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `OCR failed (${response.status})`;

    try {
      const data = await response.json();
      message =
        data?.detail ??
        data?.error?.message ??
        data?.error ??
        message;
    } catch { /* Ignore non-JSON error responses. */ }

    throw new Error(message);
  }

  return await response.json();
}

export function getThamizhiOCRImageUrl(
  sessionId: string,
): string {
  return `/playground/api/ocr/image/${encodeURIComponent(sessionId)}`;
}

export function getThamizhiOCRDocxUrl(
  sessionId: string,
): string {
  return `/playground/api/ocr/docx/${encodeURIComponent(sessionId)}`;
}
