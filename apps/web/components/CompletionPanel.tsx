"use client";

import { FormEvent, useState } from "react";
import { complete, type CompletionResult, type Locale, type RecordPreferences } from "../lib/api";
import { ResultFeedback } from "./ResultFeedback";
import { Status } from "./Status";

const AVAILABLE_MODELS = [
  { id: "slt-trilingual-1b:latest", name: "slt-trilingual-1b:latest (SLT Trilingual 1B)" },
];

export function CompletionPanel({
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
  const [model, setModel] = useState("slt-trilingual-1b:latest");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CompletionResult>();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [status, setStatus] = useState("");
  const [interactionId, setInteractionId] = useState<string>();

  // Reset result when the user edits the input
  function handleInputChange(value: string) {
    setInput(value);
    if (result) {
      setResult(undefined);
      setState("idle");
      setStatus("");
      setInteractionId(undefined);
    }
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setState("busy");
    setStatus(locale === "en" ? "Generating…" : "உருவாக்கப்படுகிறது…");
    setResult(undefined);
    setInteractionId(undefined);
    try {
      const data = await complete(text, enabled, preferences, model);
      setResult(data);
      setInteractionId(data.interaction_id);
      onUsed(data.interaction_id);
      setState("done");
      setStatus(`${data.provider_id} · ${data.model_id}`);
    } catch (error) {
      setState("error");
      setStatus(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "Unable to generate completion. Please check that the completion service is available."
            : "தொடர்ச்சியை உருவாக்க முடியவில்லை. சேவை கிடைக்கக்கூடியதா என்று சரிபார்க்கவும்.",
      );
    }
  }

  return (
    <section className="module-panel" aria-labelledby="completion-title">
      <div className="panel-heading">
        <div>
          <span className="step">05</span>
          <h2 id="completion-title">
            {locale === "en" ? "Text completion" : "உரைத் தொடர்ச்சி"}
          </h2>
        </div>
        <span className="chip">COMPLETION</span>
      </div>

      <p className="panel-description">
        {locale === "en"
          ? "Enter the beginning of a sentence or paragraph and let the trilingual model continue it."
          : "ஒரு வாக்கியம் அல்லது பத்தியின் தொடக்கத்தை உள்ளிடுங்கள், மூவொழுக்க மாதிரி அதைத் தொடரும்."}
      </p>

      <form className="completion-form" onSubmit={generate}>
        <div className="field-group">
          <label htmlFor="completion-model" className="field-label">
            {locale === "en" ? "Completion model" : "தொடர்ச்சி மாதிரி"}
          </label>
          <select
            id="completion-model"
            className="completion-select"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={!enabled || state === "busy"}
          >
            {AVAILABLE_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="completion-input" className="field-label">
            {locale === "en" ? "Your text" : "உங்கள் உரை"}
          </label>
          <textarea
            id="completion-input"
            className="completion-textarea"
            rows={5}
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder={
              locale === "en"
                ? "Start typing and let the model continue your text…\n\nExamples:\n• The University of Jaffna is\n• இன்று யாழ்ப்பாணத்தில்"
                : "உரையை உள்ளிடுங்கள், மாதிரி தொடரும்…"
            }
            disabled={!enabled}
          />
        </div>

        <button
          id="completion-submit"
          type="submit"
          className="primary"
          disabled={!enabled || !input.trim() || state === "busy"}
        >
          {state === "busy"
            ? locale === "en"
              ? "Generating…"
              : "உருவாக்கப்படுகிறது…"
            : locale === "en"
              ? "Complete"
              : "தொடர்க"}
        </button>
      </form>

      <Status state={state} message={status} />

      {result && state === "done" && (
        <div className="completion-result" aria-live="polite">
          <div className="completion-result-label">
            {locale === "en" ? "Completion" : "தொடர்ச்சி"}
          </div>
          <div className="completion-result-card">
            <span className="completion-original">{input.trim()}</span>
            <span className="completion-continuation">{result.text}</span>
          </div>
        </div>
      )}

      <ResultFeedback interactionId={interactionId} locale={locale} />
    </section>
  );
}
