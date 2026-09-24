"use client";

import { useState } from "react";
import { createTTS, loadArtifact, type Locale, type RecordPreferences, waitForJob } from "../lib/api";
import { ResultFeedback } from "./ResultFeedback";
import { Status } from "./Status";

export function TTSPanel({ locale, enabled, preferences, onUsed }: { locale: Locale; enabled: boolean; preferences: RecordPreferences; onUsed: (interactionId?: string) => void }) {
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<string>();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [interactionId, setInteractionId] = useState<string>();

  async function generate() {
    setState("busy");
    setMessage(locale === "en" ? "Generating audio…" : "ஒலி உருவாக்கப்படுகிறது…");
    try {
      const accepted = await createTTS(text, locale, enabled, preferences);
      const result = await waitForJob<{ artifact_url: string; provider_id: string; interaction_id?: string }>(accepted.job_id);
      setAudio(await loadArtifact(result.artifact_url));
      setInteractionId(result.interaction_id);
      onUsed(result.interaction_id);
      setState("done");
      setMessage(`${locale === "en" ? "Completed with" : "முடிக்கப்பட்டது"} ${result.provider_id}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "TTS failed");
    }
  }

  return (
    <section className="module-panel" aria-labelledby="tts-title">
      <div className="panel-heading">
        <div><span className="step">01</span><h2 id="tts-title">{locale === "en" ? "Text to speech" : "எழுத்திலிருந்து பேச்சு"}</h2></div>
        <span className="chip">TTS</span>
      </div>
      <label htmlFor="tts-text">{locale === "en" ? "Text" : "உரை"}</label>
      <textarea id="tts-text" value={text} onChange={(event) => setText(event.target.value)} rows={7} maxLength={2000} placeholder={locale === "en" ? "Enter a short passage…" : "ஒரு சிறிய உரையை உள்ளிடவும்…"} />
      <div className="field-meta"><span>{text.length} / 2000</span><span>WAV · {locale}</span></div>
      <button className="primary" disabled={!enabled || !text.trim() || state === "busy"} onClick={generate}>{locale === "en" ? "Generate speech" : "பேச்சை உருவாக்கு"}</button>
      <Status state={state} message={message} />
      {audio && <audio className="audio" controls src={audio}>{locale === "en" ? "Audio playback is unavailable." : "ஒலியை இயக்க முடியவில்லை."}</audio>}
      <ResultFeedback interactionId={interactionId} locale={locale} />
    </section>
  );
}
