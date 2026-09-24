"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadUsage, getUsage, type Locale, type UsageSummary } from "../lib/api";
import { Icon } from "./Icon";

export function UsagePage({ locale }: { locale: Locale }) {
  const [moduleId, setModuleId] = useState("");
  const [data, setData] = useState<UsageSummary>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await getUsage(moduleId || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load usage."); }
    finally { setLoading(false); }
  }, [moduleId]);
  useEffect(() => { void load(); }, [load]);
  const totals = data?.totals ?? { requests: 0, successful: 0, errors: 0, average_latency_ms: 0 };

  return <div className="page-stack">
    <div className="page-toolbar">
      <select aria-label="Module filter" value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
        <option value="">{locale === "en" ? "All modules" : "அனைத்துத் தொகுதிகளும்"}</option>
        <option value="chat">Chat</option><option value="tts">TTS</option><option value="asr">ASR</option><option value="ocr">OCR</option>
      </select>
      <button className="secondary-button" onClick={() => void downloadUsage(moduleId || undefined)}><Icon name="download" />{locale === "en" ? "Download CSV" : "CSV பதிவிறக்கம்"}</button>
      <button className="icon-button" aria-label="Refresh" onClick={() => void load()}><Icon name="refresh" /></button>
    </div>
    <div className="metric-grid">
      <Metric label={locale === "en" ? "Requests" : "கோரிக்கைகள்"} value={totals.requests} />
      <Metric label={locale === "en" ? "Successful" : "வெற்றிகரமானவை"} value={totals.successful} />
      <Metric label={locale === "en" ? "Errors" : "பிழைகள்"} value={totals.errors} />
      <Metric label={locale === "en" ? "Average latency" : "சராசரி தாமதம்"} value={`${totals.average_latency_ms} ms`} />
    </div>
    {error && <div className="inline-error">{error}</div>}
    {!loading && data?.rows.length === 0 ? <div className="empty-state"><span className="empty-chart"><i/><i/><i/><i/></span><h2>{locale === "en" ? "No usage in this period" : "இந்தக் காலப்பகுதியில் பயன்பாடு இல்லை"}</h2><p>{locale === "en" ? "Make your first module request to see usage here." : "பயன்பாட்டைக் காண உங்கள் முதல் தொகுதிக் கோரிக்கையைச் செய்யுங்கள்."}</p><button className="primary-button" onClick={() => void load()}>{locale === "en" ? "Refresh" : "புதுப்பி"}</button></div> : <div className="table-card"><table><thead><tr><th>Route</th><th>Requests</th><th>Successful</th><th>Errors</th><th>Avg. latency</th><th>Last used</th></tr></thead><tbody>{data?.rows.map((row) => <tr key={row.route}><td><code>{row.route}</code></td><td>{row.requests}</td><td>{row.successful}</td><td>{row.errors}</td><td>{row.average_latency_ms} ms</td><td>{new Date(row.last_used_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}
