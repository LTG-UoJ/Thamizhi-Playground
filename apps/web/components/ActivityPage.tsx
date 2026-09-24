"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteActivity, getActivity, type Interaction, type Locale } from "../lib/api";
import { Icon } from "./Icon";

export function ActivityPage({ locale, refreshKey }: { locale: Locale; refreshKey: number }) {
  const [items, setItems] = useState<Interaction[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems((await getActivity(moduleId || undefined)).interactions); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load history."); }
    finally { setLoading(false); }
  }, [moduleId]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  async function remove(id: string) { await deleteActivity(id); setItems((current) => current.filter((item) => item.interaction_id !== id)); }

  return <div className="page-stack">
    <div className="page-toolbar">
      <select aria-label="Module filter" value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
        <option value="">{locale === "en" ? "All modules" : "அனைத்துத் தொகுதிகளும்"}</option>
        <option value="chat">Chat</option><option value="tts">TTS</option><option value="asr">ASR</option><option value="ocr">OCR</option>
      </select>
      <button className="icon-button" aria-label="Refresh" onClick={() => void load()}><Icon name="refresh" /></button>
    </div>
    {error && <div className="inline-error">{error}</div>}
    {!loading && items.length === 0 ? <div className="empty-state"><Icon name="history" className="empty-icon"/><h2>{locale === "en" ? "No saved interactions" : "சேமிக்கப்பட்ட உரையாடல்கள் இல்லை"}</h2><p>{locale === "en" ? "Enable Save history before running a module. Access and security metadata remains separate." : "ஒரு தொகுதியை இயக்குவதற்கு முன் வரலாற்றைச் சேமி என்பதை இயக்கவும்."}</p></div> : <div className="activity-list">{items.map((item) => <article className="activity-card" key={item.interaction_id}>
      <div className="activity-meta"><span className="module-pill">{item.module_id.toUpperCase()}</span><span>{new Date(item.created_at).toLocaleString()}</span>{item.improvement_consent === 1 && <span className="improvement-pill">Improvement</span>}<button className="delete-button" onClick={() => void remove(item.interaction_id)} aria-label="Delete interaction"><Icon name="trash"/></button></div>
      <div className="activity-content"><div><span>{locale === "en" ? "Input" : "உள்ளீடு"}</span><p>{item.query_text}</p></div><div><span>{locale === "en" ? "Output" : "வெளியீடு"}</span><p>{item.answer_text}</p></div></div>
      <footer>{item.provider_id}{item.model_id ? ` · ${item.model_id}` : ""}</footer>
    </article>)}</div>}
  </div>;
}
