"use client";

import { FormEvent, useState } from "react";
import { generateNewsHeadline, type Locale, type RecordPreferences } from "../lib/api";
import { Status } from "./Status";

export function NewsHeadlinePanel({
  locale,
  enabled = true,
  preferences,
  onUsed,
}: {
  locale: Locale;
  enabled?: boolean;
  preferences?: RecordPreferences;
  onUsed?: (id?: string) => void;
}) {
  const [input, setInput] = useState("");
  const [headline, setHeadline] = useState<string>();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [status, setStatus] = useState("");

  function handleInputChange(value: string) {
    setInput(value);
    if (headline !== undefined) {
      setHeadline(undefined);
      setState("idle");
      setStatus("");
    }
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setState("busy");
    setStatus(locale === "en" ? "Generating headline…" : "தலைப்பு உருவாக்கப்படுகிறது…");
    setHeadline(undefined);
    try {
      const data = await generateNewsHeadline(text, preferences);
      setHeadline(data.headline);
      setState("done");
      setStatus(locale === "en" ? "Headline generated" : "தலைப்பு உருவாக்கப்பட்டது");
      onUsed?.(data.interaction_id);
    } catch (error) {
      setState("error");
      setStatus(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "Unable to generate a headline. Please check that the headline service is available."
            : "தலைப்பை உருவாக்க முடியவில்லை. சேவை கிடைக்கக்கூடியதா என்று சரிபார்க்கவும்.",
      );
    }
  }

  return (
    <section className="module-panel" aria-labelledby="news-headline-title">
      <div className="panel-heading">
        <div>
          {/* <span className="step">N2</span> */}
          <h2 id="news-headline-title">
            {locale === "en" ? "News Headline Generation" : "செய்தித் தலைப்பு உருவாக்கம்"}
          </h2>
        </div>
        <span className="chip">HEADLINE</span>
      </div>

      <p className="panel-description">
        {locale === "en"
          ? "Paste a Tamil, Sinhala, or English news article, and the model will generate a concise headline for it."
          : "தமிழ், சிங்களம் அல்லது ஆங்கில செய்திக் கட்டுரையை ஒட்டவும். மாதிரி அதற்கு ஒரு சுருக்கமான தலைப்பை உருவாக்கும்."}
      </p>

      <form className="completion-form" onSubmit={generate}>
        <div className="field-group">
          <label htmlFor="news-headline-input" className="field-label">
            {locale === "en" ? "News article content" : "செய்திக் கட்டுரை உள்ளடக்கம்"}
          </label>
          <textarea
            id="news-headline-input"
            className="completion-textarea"
            rows={8}
            value={input}
            disabled={!enabled || state === "busy"}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder={
              locale === "en"
                ? "Paste the news article content here…\n\nExample:\nமாற்றுத்திறனாளிகளின் விளையாட்டுத் திறனையும் மன உறுதியையும் வெளிப்படுத்தும் வகையில், புத்தளம் மாவட்ட மாற்றுத்திறனாளிகளின் மெய்வல்லுநர் விளையாட்டு விழா மிகுந்த உற்சாகத்துடன் நடைபெற்றது."
                : "செய்திக் கட்டுரையின் உள்ளடக்கத்தை இங்கே ஒட்டவும்…\n\nஉதாரணமாக:\nமாற்றுத்திறனாளிகளின் விளையாட்டுத் திறனையும் மன உறுதியையும் வெளிப்படுத்தும் வகையில், புத்தளம் மாவட்ட மாற்றுத்திறனாளிகளின் மெய்வல்லுநர் விளையாட்டு விழா மிகுந்த உற்சாகத்துடன் நடைபெற்றது."
            }
          />
        </div>

        <button
          id="news-headline-submit"
          type="submit"
          className="primary"
          disabled={!enabled || !input.trim() || state === "busy"}
        >
          {state === "busy"
            ? locale === "en"
              ? "Generating…"
              : "உருவாக்கப்படுகிறது…"
            : locale === "en"
              ? "Generate Headline"
              : "தலைப்பை உருவாக்கு"}
        </button>
      </form>

      <Status state={state} message={status} />

      {headline !== undefined && state === "done" && (
        <div className="completion-result" aria-live="polite">
          <div className="completion-result-label">
            {locale === "en" ? "Generated headline" : "உருவாக்கப்பட்ட தலைப்பு"}
          </div>
          <div className="ceynews-headline-card">
            <p className="ceynews-headline-text">{headline}</p>
          </div>
        </div>
      )}
    </section>
  );
}
