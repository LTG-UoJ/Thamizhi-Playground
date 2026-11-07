"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminApiHistory, type ApiAccessEvent, type Locale } from "../lib/api";

export function ActivityPage({ refreshKey }: { locale: Locale; refreshKey: number }) {
  const [events, setEvents] = useState<ApiAccessEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [researchFilter, setResearchFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");


  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setEvents((await getAdminApiHistory()).events);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load API history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const filtered = events.filter((event) => {
    if (moduleFilter && !event.route.toLowerCase().includes(moduleFilter.toLowerCase())) return false;
    if (historyFilter === "saved" && !event.history_saved) return false;
    if (historyFilter === "not-saved" && event.history_saved) return false;
    if (researchFilter === "permitted" && !event.research_use) return false;
    if (researchFilter === "not-permitted" && event.research_use) return false;
    if (userSearch && !(event.user_name || event.user_id || "").toLowerCase().includes(userSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
          <option value="">All modules and tools</option>
          <option value="/tts/">Text to Speech</option>
          <option value="/asr/">Speech to Text</option>
          <option value="/chat/">Chat</option>
          <option value="/ocr/">OCR</option>
          <option value="/completion/">Completion</option>
          <option value="/news/classify">News Classification</option>
          <option value="/news/generate-headline">News Headline Generation</option>
        </select>
        <select aria-label="History filter" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}>
          <option value="all">All history</option>
          <option value="saved">Saved</option>
          <option value="not-saved">Not saved</option>
        </select>
        <select aria-label="Research use filter" value={researchFilter} onChange={(e) => setResearchFilter(e.target.value)}>
          <option value="all">All research permissions</option>
          <option value="permitted">Permitted</option>
          <option value="not-permitted">Not permitted</option>
        </select>
        <input
          aria-label="Search users"
          placeholder="Search user"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
        />
        <button className="icon-button" onClick={() => void load()}>Refresh</button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {loading ? <p>Loading API history...</p> : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Service</th><th>Method</th>
                <th>API route</th>
                <th>Status</th>
                <th>Latency</th>
                <th>History</th><th>Research Use</th><th>Input</th>
                <th>Output</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.event_id}>
                  <td>{new Date(event.occurred_at).toLocaleString()}</td>
                  <td>{event.user_name || event.user_id || "Anonymous"}</td>
                  <td>{event.service || 'Other'}</td><td>{event.method}</td>
                  <td><code>{event.route}</code></td>
                  <td>{event.status_code}</td>
                  <td>{event.latency_ms} ms</td>
                  <td>{event.history_saved ? "Saved" : "Not saved"}</td>
                  <td>{event.research_use ? "Permitted" : "Not permitted"}</td>
                  <td style={{ maxWidth: 280, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {event.input_text ?? "Not shared / not linked"}
                  </td>
                  <td style={{ maxWidth: 280, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {event.output_text ?? "Not shared / not linked"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


    </div>
  );
}

