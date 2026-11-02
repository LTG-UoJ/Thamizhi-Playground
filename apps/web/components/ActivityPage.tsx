"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminApiHistory, type ApiAccessEvent, type Locale } from "../lib/api";

export function ActivityPage({ refreshKey }: { locale: Locale; refreshKey: number }) {
  const [events, setEvents] = useState<ApiAccessEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");

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

  const filtered = events.filter((event) =>
    !moduleFilter || event.route.toLowerCase().includes(moduleFilter.toLowerCase())
  );

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
                <th>Method</th>
                <th>API route</th>
                <th>Status</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.event_id}>
                  <td>{new Date(event.occurred_at).toLocaleString()}</td>
                  <td>{event.user_id || "Anonymous"}</td>
                  <td>{event.method}</td>
                  <td><code>{event.route}</code></td>
                  <td>{event.status_code}</td>
                  <td>{event.latency_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

