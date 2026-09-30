"use client";

import { useEffect, useState } from "react";
import {
  createTTS,
  loadArtifact,
  type Locale,
  type RecordPreferences,
  waitForJob,
} from "../lib/api";
import { ResultFeedback } from "./ResultFeedback";
import { Status } from "./Status";

export function TTSPanel({
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
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<"male" | "female">("male");
  const [referenceWav, setReferenceWav] = useState<File>();
  const [audio, setAudio] = useState<string>();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [interactionId, setInteractionId] = useState<string>();

  useEffect(() => {
    return () => {
      if (audio) URL.revokeObjectURL(audio);
    };
  }, [audio]);

  async function generate() {
    if (!text.trim() || state === "busy") return;

    setState("busy");
    setMessage(locale === "en" ? "Generating speech…" : "பேச்சு உருவாக்கப்படுகிறது…");
    setAudio(undefined);
    setInteractionId(undefined);

    try {
      const accepted = await createTTS(
        text,
        "ta-LK",
        voice,
        enabled,
        preferences,
        referenceWav
      );

      const result = await waitForJob<{
        artifact_url: string;
        provider_id: string;
        interaction_id?: string;
      }>(accepted.job_id);

      setAudio(await loadArtifact(result.artifact_url));
      setInteractionId(result.interaction_id);
      onUsed(result.interaction_id);
      setState("done");
      setMessage(
        locale === "en"
          ? `Audio ready · ${result.provider_id}`
          : `ஒலி தயாராக உள்ளது · ${result.provider_id}`
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "TTS failed");
    }
  }

  return (
    <section className="tts-studio" aria-labelledby="tts-title">
      <div className="tts-hero">
        <div>
          <span className="tts-eyebrow">THAMIZHI · XTTS</span>
          <h2 id="tts-title">
            {locale === "en" ? "Turn text into speech" : "உரையைப் பேச்சாக மாற்றுங்கள்"}
          </h2>
          <p>
            {locale === "en"
              ? "Write in Tamil, choose a voice, and listen to your result."
              : "தமிழில் எழுதுங்கள். குரலைத் தேர்ந்தெடுத்து கேளுங்கள்."}
          </p>
        </div>
        <span className="tts-format">WAV audio</span>
      </div>

      <div className="tts-body">
        <div className="tts-text-heading">
          <label htmlFor="tts-text">
            {locale === "en" ? "Your text" : "உங்கள் உரை"}
          </label>
          <span>{text.length} / 2000</span>
        </div>

        <textarea
          id="tts-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          maxLength={2000}
          placeholder={
            locale === "en"
              ? "உங்கள் தமிழ் உரையை இங்கே எழுதுங்கள்…"
              : "உங்கள் தமிழ் உரையை இங்கே எழுதுங்கள்…"
          }
        />

        <div className="tts-options">
          <fieldset className="tts-option">
            <legend>{locale === "en" ? "Voice" : "குரல்"}</legend>
            <div className="tts-voices">
              <label className={voice === "male" ? "selected" : ""}>
                <input
                  type="radio"
                  name="tts-voice"
                  checked={voice === "male"}
                  onChange={() => setVoice("male")}
                />
                {locale === "en" ? "Male" : "ஆண்"}
              </label>
              <label className={voice === "female" ? "selected" : ""}>
                <input
                  type="radio"
                  name="tts-voice"
                  checked={voice === "female"}
                  onChange={() => setVoice("female")}
                />
                {locale === "en" ? "Female" : "பெண்"}
              </label>
            </div>
          </fieldset>
        </div>

        <div className="tts-reference">
          <div>
            <label htmlFor="tts-reference">
              {locale === "en" ? "Reference voice" : "மாதிரிக் குரல்"}
              <span className="tts-optional">
                {locale === "en" ? " · optional" : " · விருப்பம்"}
              </span>
            </label>
            <p>
              {locale === "en"
                ? "Upload a PCM WAV to guide the voice. Maximum 10 MiB."
                : "குரல் மாதிரியாக PCM WAV கோப்பைத் தேர்ந்தெடுக்கவும். அதிகபட்சம் 10 MiB."}
            </p>
          </div>

          <input
            id="tts-reference"
            type="file"
            accept=".wav,audio/wav,audio/x-wav"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && file.size > 10 * 1024 * 1024) {
                setMessage(
                  locale === "en"
                    ? "Reference WAV must be at most 10 MiB."
                    : "WAV கோப்பு 10 MiB-க்குள் இருக்க வேண்டும்."
                );
                event.target.value = "";
                setReferenceWav(undefined);
                return;
              }
              setReferenceWav(file);
            }}
          />

          <div className="tts-file-status">
            <span>
              {referenceWav
                ? referenceWav.name
                : locale === "en"
                  ? "Default reference voice"
                  : "இயல்புநிலை மாதிரிக் குரல்"}
            </span>
            {referenceWav && (
              <button
                type="button"
                onClick={() => {
                  setReferenceWav(undefined);
                  const input = document.getElementById(
                    "tts-reference"
                  ) as HTMLInputElement | null;
                  if (input) input.value = "";
                }}
              >
                {locale === "en" ? "Remove" : "நீக்கு"}
              </button>
            )}
          </div>
        </div>

        <div className="tts-actions">
          <button
            className="tts-generate"
            type="button"
            disabled={!enabled || !text.trim() || state === "busy"}
            onClick={generate}
          >
            {state === "busy"
              ? locale === "en" ? "Generating…" : "உருவாக்கப்படுகிறது…"
              : locale === "en" ? "Generate speech →" : "பேச்சை உருவாக்கு →"}
          </button>
          <span>தமிழ் · WAV</span>
        </div>

        <Status state={state} message={message} />

        {audio && (
          <div className="tts-result">
            <strong>{locale === "en" ? "Your audio" : "உங்கள் ஒலி"}</strong>
            <audio controls src={audio}>
              {locale === "en"
                ? "Audio playback is unavailable."
                : "ஒலியை இயக்க முடியவில்லை."}
            </audio>
          </div>
        )}

        <ResultFeedback interactionId={interactionId} locale={locale} />
      </div>

      <style jsx>{`
        .tts-studio {
          overflow: hidden;
          border: 1px solid #dce8df;
          border-radius: 24px;
          background: #fffdfa;
          box-shadow: 0 20px 55px rgba(24, 69, 47, .09);
        }
        .tts-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          padding: clamp(1.4rem, 3vw, 2.3rem);
          background: linear-gradient(115deg, #e8f4eb, #f9f5e9 75%);
          border-bottom: 1px solid #dce8df;
        }
        .tts-eyebrow {
          color: #286f51;
          font-size: .72rem;
          font-weight: 800;
          letter-spacing: .15em;
        }
        .tts-hero h2 {
          margin: .5rem 0;
          font-size: clamp(1.5rem, 3vw, 2.2rem);
          line-height: 1.25;
        }
        .tts-hero p {
          margin: 0;
          color: #52675a;
        }
        .tts-format {
          flex: none;
          padding: .45rem .75rem;
          border-radius: 999px;
          color: #246348;
          background: #fff;
          font-size: .8rem;
          font-weight: 700;
        }
        .tts-body {
          padding: clamp(1.4rem, 3vw, 2.3rem);
        }
        .tts-text-heading, .tts-actions, .tts-file-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .tts-text-heading {
          margin-bottom: .65rem;
        }
        .tts-text-heading label, .tts-option > label,
        .tts-option legend, .tts-reference label {
          font-weight: 700;
        }
        .tts-text-heading span, .tts-actions span {
          color: #6c7b70;
          font-size: .82rem;
        }
        textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 1rem 1.15rem;
          border: 1px solid #cad9ce;
          border-radius: 14px;
          background: #fff;
          font: inherit;
          line-height: 1.7;
          resize: vertical;
        }
        textarea:focus, select:focus, input:focus-visible {
          outline: 3px solid #a8d7b7;
          outline-offset: 2px;
        }
        .tts-options {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 1rem;
          margin-top: 1.2rem;
        }
        .tts-option {
          min-width: 0;
          margin: 0;
          padding: 1rem;
          border: 1px solid #e0e9e1;
          border-radius: 14px;
          background: #f8faf7;
        }
        .tts-option select {
          display: block;
          width: 100%;
          margin-top: .65rem;
          padding: .7rem;
          border: 1px solid #c6d8ca;
          border-radius: 9px;
          background: white;
          font: inherit;
        }
        .tts-voices {
          display: flex;
          gap: .65rem;
          margin-top: .65rem;
        }
        .tts-voices label {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: .45rem;
          padding: .55rem;
          border: 1px solid #cbdace;
          border-radius: 9px;
          background: #fff;
          cursor: pointer;
        }
        .tts-voices .selected {
          border-color: #3a9465;
          background: #eaf6ed;
          color: #175b3c;
          font-weight: 700;
        }
        .tts-reference {
          display: grid;
          gap: .8rem;
          margin: 1.2rem 0;
          padding: 1.2rem;
          border: 1px dashed #a8c5ae;
          border-radius: 14px;
          background: #fbfdf9;
        }
        .tts-reference p {
          margin: .35rem 0 0;
          color: #627467;
          font-size: .88rem;
        }
        .tts-optional {
          color: #708477;
          font-weight: 400;
        }
        .tts-reference input {
          max-width: 100%;
          font: inherit;
        }
        .tts-file-status span {
          overflow-wrap: anywhere;
          color: #45604c;
          font-size: .88rem;
        }
        .tts-file-status button {
          border: 0;
          background: transparent;
          color: #216c49;
          font: inherit;
          text-decoration: underline;
          cursor: pointer;
        }
        .tts-actions {
          margin: 1.4rem 0 1rem;
        }
        .tts-generate {
          min-height: 48px;
          padding: .8rem 1.35rem;
          border: 0;
          border-radius: 11px;
          background: #175f3e;
          color: #fff;
          font: inherit;
          font-weight: 750;
          cursor: pointer;
        }
        .tts-generate:hover:not(:disabled) {
          background: #0c492d;
        }
        .tts-generate:disabled {
          opacity: .5;
          cursor: not-allowed;
        }
        .tts-result {
          display: grid;
          gap: .7rem;
          margin: 1.3rem 0;
          padding: 1rem;
          border-radius: 13px;
          background: #eef7ef;
        }
        .tts-result audio {
          width: 100%;
        }
        @media (max-width: 650px) {
          .tts-options {
            grid-template-columns: 1fr;
          }
          .tts-hero {
            flex-direction: column;
          }
        }
      `}</style>
    </section>
  );
}
