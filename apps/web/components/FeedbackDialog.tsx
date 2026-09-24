"use client";

import { useState } from "react";
import { logout, submitExperienceFeedback, type Locale, type ModuleId } from "../lib/api";
import { Icon } from "./Icon";

export function FeedbackDialog({ locale, modulesUsed, onCancel, onSignedOut }: { locale: Locale; modulesUsed: ModuleId[]; onCancel: () => void; onSignedOut: () => void }) {
  const [rating, setRating] = useState<number>();
  const [outcome, setOutcome] = useState<"yes" | "partly" | "no">();
  const [comment, setComment] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function finish(withFeedback: boolean) {
    setSubmitting(true);
    try {
      if (withFeedback) {
        await Promise.race([
          submitExperienceFeedback({ rating, task_outcome: outcome, module_ids: modulesUsed, comment: comment || undefined, follow_up_allowed: followUp, locale }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("feedback timeout")), 2_000)),
        ]).catch(() => undefined);
      }
      await logout().catch(() => undefined);
    } finally { onSignedOut(); }
  }

  return <div className="dialog-backdrop" role="presentation"><section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
    <div className="dialog-heading"><div><span>OPTIONAL FEEDBACK</span><h2 id="feedback-title">{locale === "en" ? "How was your experience?" : "உங்கள் அனுபவம் எப்படி இருந்தது?"}</h2></div><button className="icon-button" onClick={onCancel} aria-label="Close"><Icon name="close"/></button></div>
    <fieldset><legend>{locale === "en" ? "Overall experience" : "ஒட்டுமொத்த அனுபவம்"}</legend><div className="rating-row">{[1,2,3,4,5].map((value) => <button key={value} className={rating === value ? "selected" : ""} onClick={() => setRating(value)} aria-label={`${value} of 5`}>{value}</button>)}</div></fieldset>
    <fieldset><legend>{locale === "en" ? "Did you achieve what you intended?" : "நீங்கள் நினைத்ததை அடைந்தீர்களா?"}</legend><div className="choice-row">{(["yes","partly","no"] as const).map((value) => <button key={value} className={outcome === value ? "selected" : ""} onClick={() => setOutcome(value)}>{value === "yes" ? "Yes" : value === "partly" ? "Partly" : "No"}</button>)}</div></fieldset>
    <label className="dialog-label" htmlFor="feedback-comment">{locale === "en" ? "Comment (optional)" : "கருத்து (விருப்பத்தேர்வு)"}</label><textarea id="feedback-comment" rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={locale === "en" ? "Tell us what worked or what should improve…" : "எது நன்றாக இருந்தது அல்லது எதை மேம்படுத்த வேண்டும்…"}/>
    <label className="check-row"><input type="checkbox" checked={followUp} onChange={(event) => setFollowUp(event.target.checked)}/><span>{locale === "en" ? "You may contact me about this feedback" : "இந்தக் கருத்தைப் பற்றி என்னைத் தொடர்புகொள்ளலாம்"}</span></label>
    <p className="dialog-privacy">{locale === "en" ? "Your prompts, answers and access logs are not included in this feedback." : "உங்கள் கேள்விகள், பதில்கள் மற்றும் அணுகல் பதிவுகள் இந்தக் கருத்தில் சேர்க்கப்படாது."}</p>
    <div className="dialog-actions"><button className="text-button" disabled={submitting} onClick={() => void finish(false)}>{locale === "en" ? "Skip and sign out" : "தவிர்த்து வெளியேறு"}</button><button className="secondary-button" disabled={submitting} onClick={onCancel}>{locale === "en" ? "Cancel" : "ரத்துசெய்"}</button><button className="primary-button" disabled={submitting} onClick={() => void finish(true)}>{locale === "en" ? "Submit and sign out" : "சமர்ப்பித்து வெளியேறு"}</button></div>
  </section></div>;
}
