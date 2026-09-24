"use client";

import { FormEvent, useState } from "react";
import { chat, type Locale, type RecordPreferences } from "../lib/api";
import { ResultFeedback } from "./ResultFeedback";
import { Status } from "./Status";

type Message = { role: "user" | "assistant"; content: string };

export function ChatPanel({ locale, enabled, preferences, onUsed }: { locale: Locale; enabled: boolean; preferences: RecordPreferences; onUsed: (interactionId?: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [status, setStatus] = useState("");
  const [interactionId, setInteractionId] = useState<string>();

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;
    setMessages((current) => [...current, { role: "user", content }]);
    setInput("");
    setState("busy");
    setStatus(locale === "en" ? "Thinking…" : "பதில் தயாராகிறது…");
    try {
      const result = await chat(content, locale, enabled, preferences);
      setMessages((current) => [...current, { role: "assistant", content: result.message.content }]);
      setInteractionId(result.interaction_id);
      onUsed(result.interaction_id);
      setState("done");
      setStatus(`${result.provider_id} · ${result.model_id}`);
    } catch (error) {
      setState("error");
      setStatus(error instanceof Error ? error.message : "Chat failed");
    }
  }

  return (
    <section className="module-panel chat-panel" aria-labelledby="chat-title">
      <div className="panel-heading"><div><span className="step">03</span><h2 id="chat-title">{locale === "en" ? "Small chat" : "சிறிய உரையாடல்"}</h2></div><span className="chip">CHAT</span></div>
      <div className="conversation" aria-live="polite">
        {messages.length === 0 ? <div className="empty-chat"><span>✦</span><p>{locale === "en" ? "Ask a focused question in English or Tamil." : "தமிழில் அல்லது ஆங்கிலத்தில் ஒரு கேள்வியைக் கேளுங்கள்."}</p></div> : messages.map((message, index) => <div key={`${message.role}-${index}`} className={`bubble ${message.role}`}><span>{message.role === "user" ? (locale === "en" ? "You" : "நீங்கள்") : "AI"}</span><p>{message.content}</p></div>)}
      </div>
      <form className="chat-form" onSubmit={send}>
        <label className="sr-only" htmlFor="chat-input">{locale === "en" ? "Message" : "செய்தி"}</label>
        <textarea id="chat-input" rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder={locale === "en" ? "Write a message…" : "ஒரு செய்தியை எழுதுங்கள்…"} />
        <button className="primary send" disabled={!enabled || !input.trim() || state === "busy"}>{locale === "en" ? "Send" : "அனுப்பு"}<span aria-hidden="true">→</span></button>
      </form>
      <Status state={state} message={status} />
      <ResultFeedback interactionId={interactionId} locale={locale} />
    </section>
  );
}
