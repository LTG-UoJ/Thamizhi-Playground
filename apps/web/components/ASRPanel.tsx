"use client";

import { useRef, useState } from "react";
import {
  createASRSession,
  getASRWebSocketUrl,
  transcribe,
  type Locale,
  type RecordPreferences,
} from "../lib/api";
import { ResultFeedback } from "./ResultFeedback";
import { Status } from "./Status";

export function ASRPanel({
  locale,
  enabled,
  preferences,
  onUsed,
}: {
  locale: Locale;
  enabled: boolean;
  preferences: RecordPreferences;
  onUsed: (interactionId?: string) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const chunks = useRef<Blob[]>([]);
  const finalReceived = useRef(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [interactionId, setInteractionId] = useState<string>();

  async function submit(blob: Blob) {
    setState("busy");
    setMessage(locale === "en" ? "Transcribing…" : "எழுத்தாக்கப்படுகிறது…");
    try {
      const result = await transcribe(blob, locale, enabled, preferences);
      setTranscript(result.text);
      setInteractionId(result.interaction_id);
      onUsed(result.interaction_id);
      setState("done");
      setMessage(
        `${locale === "en" ? "Completed with" : "முடிக்கப்பட்டது"} ${result.provider_id}`,
      );
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "ASR failed"
            : "எழுத்தாக்கம் தோல்வியடைந்தது",
      );
    }
  }

  async function toggleRecording() {
    if (recording) {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "end" }));
        setState("busy");
        setMessage(locale === "en" ? "Transcribing…" : "எழுத்தாக்கப்படுகிறது…");
      }
      recorder.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      finalReceived.current = false;
      setTranscript("");
      setInteractionId(undefined);

      // Attempt to establish WebSocket session
      let socket: WebSocket | null = null;
      try {
        const session = await createASRSession(locale, enabled);
        const wsUrl = getASRWebSocketUrl(session.stream_url, enabled);
        if (wsUrl) {
          socket = new WebSocket(wsUrl);
          socketRef.current = socket;

          socket.onopen = () => {
            setState("idle");
            setMessage(locale === "en" ? "Listening…" : "கேட்கிறது…");
          };

          socket.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === "ready") {
                setMessage(locale === "en" ? "Listening…" : "கேட்கிறது…");
              } else if (data.type === "partial" && data.text) {
                if (data.text !== "…") {
                  setTranscript(data.text);
                }
              } else if (data.type === "final") {
                finalReceived.current = true;
                setTranscript(data.text);
                setInteractionId(data.interaction_id);
                onUsed(data.interaction_id);
                setState("done");
                setMessage(
                  `${locale === "en" ? "Completed with" : "முடிக்கப்பட்டது"} ${data.provider_id || "external-asr"}`,
                );
              }
            } catch {
              // Ignore non-JSON
            }
          };

          socket.onerror = () => {
            // Keep going, fallback onstop
          };

          socket.onclose = () => {
            socketRef.current = null;
          };
        }
      } catch {
        socketRef.current = null;
      }

      const next = new MediaRecorder(stream);
      next.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0) {
          chunks.current.push(event.data);
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            try {
              const buffer = await event.data.arrayBuffer();
              socketRef.current.send(buffer);
            } catch {
              // Ignore buffer send error
            }
          }
        }
      };

      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        // If final transcript was not received via WebSocket within 1.5s, fallback to HTTP upload
        setTimeout(() => {
          if (!finalReceived.current && chunks.current.length > 0) {
            const blob = new Blob(chunks.current, {
              type: next.mimeType || "audio/webm",
            });
            void submit(blob);
          }
        }, 1500);
      };

      next.start(250);
      recorder.current = next;
      setRecording(true);
      setState("idle");
      setMessage(locale === "en" ? "Recording…" : "பதிவு செய்யப்படுகிறது…");
    } catch {
      setState("error");
      setMessage(
        locale === "en"
          ? "Microphone access was not granted."
          : "ஒலிவாங்கி அணுகல் வழங்கப்படவில்லை.",
      );
    }
  }

  async function upload(file?: File) {
    if (file) {
      setTranscript("");
      setInteractionId(undefined);
      await submit(file);
    }
  }

  return (
    <section className="module-panel" aria-labelledby="asr-title">
      <div className="panel-heading"><div><span className="step">02</span><h2 id="asr-title">{locale === "en" ? "Speech to text" : "பேச்சிலிருந்து எழுத்து"}</h2></div><span className="chip">ASR</span></div>
      <div className="recording-box">
        <button className={recording ? "record recording" : "record"} disabled={!enabled || state === "busy"} onClick={toggleRecording}><span className="record-dot" />{recording ? (locale === "en" ? "Stop recording" : "பதிவை நிறுத்து") : (locale === "en" ? "Start recording" : "பதிவைத் தொடங்கு")}</button>
        <span>{locale === "en" ? "or" : "அல்லது"}</span>
        <label className="file-button">{locale === "en" ? "Upload audio" : "ஒலியைப் பதிவேற்று"}<input type="file" accept="audio/*" disabled={!enabled || state === "busy"} onChange={(event) => void upload(event.target.files?.[0])} /></label>
      </div>
      <Status state={state} message={message} />
      {transcript && <div className="result-card"><span className="result-label">{locale === "en" ? "Transcript" : "எழுத்தாக்கம்"}</span><p>{transcript}</p></div>}
      <ResultFeedback interactionId={interactionId} locale={locale} />
    </section>
  );
}
