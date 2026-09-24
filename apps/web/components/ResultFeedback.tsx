"use client";

import { useState } from "react";
import type { Locale } from "../lib/api";
import { rateInteraction } from "../lib/api";

export function ResultFeedback({ interactionId, locale }: { interactionId?: string; locale: Locale }) {
  const [rating, setRating] = useState<"helpful" | "not_helpful">();
  if (!interactionId) return null;

  async function rate(next: "helpful" | "not_helpful") {
    setRating(next);
    try { await rateInteraction(interactionId!, next); } catch { setRating(undefined); }
  }

  return <div className="result-feedback" aria-label={locale === "en" ? "Rate this result" : "இந்த முடிவை மதிப்பிடவும்"}>
    <span>{locale === "en" ? "Was this useful?" : "இது பயனுள்ளதாக இருந்ததா?"}</span>
    <button className={rating === "helpful" ? "selected" : ""} onClick={() => void rate("helpful")} aria-label="Helpful">Yes</button>
    <button className={rating === "not_helpful" ? "selected" : ""} onClick={() => void rate("not_helpful")} aria-label="Not helpful">No</button>
  </div>;
}
