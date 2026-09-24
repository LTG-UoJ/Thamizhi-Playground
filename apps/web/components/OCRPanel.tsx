"use client";

import Image from "next/image";
import { useState } from "react";
import { createOCR, type Locale, type RecordPreferences, waitForJob } from "../lib/api";
import { ResultFeedback } from "./ResultFeedback";
import { Status } from "./Status";

export function OCRPanel({ locale, enabled, preferences, onUsed }: { locale: Locale; enabled: boolean; preferences: RecordPreferences; onUsed: (interactionId?: string) => void }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [interactionId, setInteractionId] = useState<string>();

  function select(next?: File) {
    setFile(next);
    setText("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(next ? URL.createObjectURL(next) : undefined);
  }

  async function recognise() {
    if (!file) return;
    setState("busy");
    setMessage(locale === "en" ? "Reading image…" : "படம் வாசிக்கப்படுகிறது…");
    try {
      const accepted = await createOCR(file, locale, enabled, preferences);
      const result = await waitForJob<{ text: string; provider_id: string; interaction_id?: string }>(accepted.job_id, 90_000);
      setText(result.text);
      setInteractionId(result.interaction_id);
      onUsed(result.interaction_id);
      setState("done");
      setMessage(`${locale === "en" ? "Completed with" : "முடிக்கப்பட்டது"} ${result.provider_id}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "OCR failed");
    }
  }

  return (
    <section className="module-panel" aria-labelledby="ocr-title">
      <div className="panel-heading"><div><span className="step">04</span><h2 id="ocr-title">{locale === "en" ? "Image to text" : "படத்திலிருந்து எழுத்து"}</h2></div><span className="chip">OCR</span></div>
      <label className="drop-zone">
        {preview ? <Image src={preview} alt={locale === "en" ? "Selected document preview" : "தேர்ந்தெடுக்கப்பட்ட ஆவணத்தின் முன்னோட்டம்"} width={820} height={520} unoptimized /> : <><span className="upload-mark">↑</span><strong>{locale === "en" ? "Choose a document image" : "ஆவணப் படத்தைத் தேர்ந்தெடுக்கவும்"}</strong><small>PNG · JPEG · WEBP · 15 MiB</small></>}
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!enabled} onChange={(event) => select(event.target.files?.[0])} />
      </label>
      <button className="primary" disabled={!enabled || !file || state === "busy"} onClick={recognise}>{locale === "en" ? "Extract text" : "உரையைப் பிரித்தெடு"}</button>
      <Status state={state} message={message} />
      {text && <div className="result-card"><span className="result-label">{locale === "en" ? "Recognised text" : "அடையாளம் காணப்பட்ட உரை"}</span><p>{text}</p></div>}
      <ResultFeedback interactionId={interactionId} locale={locale} />
    </section>
  );
}
