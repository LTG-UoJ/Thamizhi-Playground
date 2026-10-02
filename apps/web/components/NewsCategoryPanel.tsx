"use client";

import { FormEvent, useState } from "react";
import { classifyNews, type Locale, type RecordPreferences } from "../lib/api";
import { Status } from "./Status";

const CATEGORY_LABELS: Record<string, { en: string; ta: string }> = {
  Local: { en: "Local", ta: "உள்நாட்டு" },
  International: { en: "International", ta: "சர்வதேச" },
  Sports: { en: "Sports", ta: "விளையாட்டு" },
  Business: { en: "Business", ta: "வணிகம்" },
};

export function NewsCategoryPanel({
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
  const [category, setCategory] = useState<string>();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [status, setStatus] = useState("");

  function handleInputChange(value: string) {
    setInput(value);
    if (category !== undefined) {
      setCategory(undefined);
      setState("idle");
      setStatus("");
    }
  }

  async function classify(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setState("busy");
    setStatus(locale === "en" ? "Classifying…" : "வகைப்படுத்தப்படுகிறது…");
    setCategory(undefined);
    try {
      const data = await classifyNews(text, preferences);
      setCategory(data.category);
      setState("done");
      setStatus(locale === "en" ? "Classification complete" : "வகைப்படுத்தல் முடிந்தது");
      onUsed?.(data.interaction_id);
    } catch (error) {
      setState("error");
      setStatus(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "Unable to classify the article. Please check that the classification service is available."
            : "கட்டுரையை வகைப்படுத்த முடியவில்லை. சேவை கிடைக்கக்கூடியதா என்று சரிபார்க்கவும்.",
      );
    }
  }

  const categoryLabel =
    category !== undefined
      ? (locale === "en"
        ? (CATEGORY_LABELS[category]?.en ?? category)
        : (CATEGORY_LABELS[category]?.ta ?? category))
      : undefined;

  return (
    <section className="module-panel" aria-labelledby="news-category-title">
      <div className="panel-heading">
        <div>
          {/* <span className="step">N1</span> */}
          <h2 id="news-category-title">
            {locale === "en" ? "News Category Classification" : "செய்தி வகைப்படுத்தல்"}
          </h2>
        </div>
        <span className="chip">CLASSIFY</span>
      </div>

      <p className="panel-description">
        {locale === "en"
          ? "Paste a Tamil, Sinhala, or English news article, and the model will predict its category: Local, International, Sports, or Business."
          : "தமிழ், சிங்களம் அல்லது ஆங்கில செய்திக் கட்டுரையை ஒட்டவும். மாதிரி அதன் வகையை முன்னறிவிக்கும்: உள்நாட்டு, சர்வதேச, விளையாட்டு அல்லது வணிகம்."}
      </p>

      <form className="completion-form" onSubmit={classify}>
        <div className="field-group">
          <label htmlFor="news-category-input" className="field-label">
            {locale === "en" ? "News article content" : "செய்திக் கட்டுரை உள்ளடக்கம்"}
          </label>
          <textarea
            id="news-category-input"
            className="completion-textarea"
            rows={7}
            value={input}
            disabled={!enabled || state === "busy"}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder={
              locale === "en"
                ? "Paste the news article content here…\n\nExample:\nஇலங்கை கிரிக்கெட் அணி இன்று முக்கியமான போட்டியில் விளையாடுகிறது."
                : "செய்திக் கட்டுரையின் உள்ளடக்கத்தை இங்கே ஒட்டவும்…\n\nஉதாரணமாக:\nஇலங்கை கிரிக்கெட் அணி இன்று முக்கியமான போட்டியில் விளையாடுகிறது."
            }
          />
        </div>

        <button
          id="news-category-submit"
          type="submit"
          className="primary"
          disabled={!enabled || !input.trim() || state === "busy"}
        >
          {state === "busy"
            ? locale === "en"
              ? "Classifying…"
              : "வகைப்படுத்தப்படுகிறது…"
            : locale === "en"
              ? "Classify"
              : "வகைப்படுத்து"}
        </button>
      </form>

      <Status state={state} message={status} />

      {category !== undefined && state === "done" && (
        <div className="completion-result" aria-live="polite">
          <div className="completion-result-label">
            {locale === "en" ? "Predicted category" : "கணிக்கப்பட்ட வகை"}
          </div>
          <div className="ceynews-category-card">
            <span className={`category-badge category-badge-${category.toLowerCase()}`}>
              {categoryLabel}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
