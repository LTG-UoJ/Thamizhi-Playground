"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getModules,
  type Locale,
  type ModuleDescriptor,
  type ModuleId,
  type RecordPreferences,
} from "../lib/api";
import { ActivityPage } from "./ActivityPage";
import { ASRPanel } from "./ASRPanel";
import { ChatPanel } from "./ChatPanel";
import { CompletionPanel } from "./CompletionPanel";
import { FeedbackDialog } from "./FeedbackDialog";
import { HomePage } from "./HomePage";
import { Icon, type IconName } from "./Icon";
import { NewsCategoryPanel } from "./NewsCategoryPanel";
import { NewsHeadlinePanel } from "./NewsHeadlinePanel";
import { OCRPanel } from "./OCRPanel";
import { TTSPanel } from "./TTSPanel";
import { UsagePage } from "./UsagePage";

type PageId = "home" | "usage" | "activity" | "news-category" | "news-headline" | ModuleId;

const fallbackModules: ModuleDescriptor[] = [
  { module_id: "tts", descriptor_version: "1.0", capability: "tts", route_slug: "text-to-speech", navigation_group: "ai_modules", title_key: "modules.tts.title", description_key: "modules.tts.description", icon_key: "audio-lines", sort_order: 10, enabled: true, renderer_kind: "compiled_custom", provider_capability: "tts" },
  { module_id: "asr", descriptor_version: "1.0", capability: "asr", route_slug: "speech-to-text", navigation_group: "ai_modules", title_key: "modules.asr.title", description_key: "modules.asr.description", icon_key: "mic", sort_order: 20, enabled: true, renderer_kind: "compiled_custom", provider_capability: "asr" },
  { module_id: "chat", descriptor_version: "1.0", capability: "chat", route_slug: "chat", navigation_group: "ai_modules", title_key: "modules.chat.title", description_key: "modules.chat.description", icon_key: "message-circle", sort_order: 30, enabled: true, renderer_kind: "compiled_custom", provider_capability: "chat" },
  { module_id: "ocr", descriptor_version: "1.0", capability: "ocr", route_slug: "ocr", navigation_group: "ai_modules", title_key: "modules.ocr.title", description_key: "modules.ocr.description", icon_key: "scan-text", sort_order: 40, enabled: true, renderer_kind: "compiled_custom", provider_capability: "ocr" },
  { module_id: "completion", descriptor_version: "1.0", capability: "completion", route_slug: "completion", navigation_group: "ai_modules", title_key: "modules.completion.title", description_key: "modules.completion.description", icon_key: "type", sort_order: 50, enabled: true, renderer_kind: "compiled_custom", provider_capability: "completion" },
];

const labels: Record<Locale, Record<PageId, string>> = {
  en: { home: "Home", usage: "Usage", activity: "Activity history", chat: "Small chat", tts: "Text to Speech", asr: "Speech to Text", ocr: "OCR", completion: "Completion", "news-category": "News Category Classification", "news-headline": "News Headline Generation" },
  "ta-LK": { home: "முகப்பு", usage: "பயன்பாடு", activity: "செயற்பாட்டு வரலாறு", chat: "சிறிய உரையாடல்", tts: "எழுத்திலிருந்து பேச்சு", asr: "பேச்சிலிருந்து எழுத்து", ocr: "எழுத்துணரி", completion: "உரைத் தொடர்ச்சி", "news-category": "செய்தி வகைப்படுத்தல்", "news-headline": "செய்தித் தலைப்பு உருவாக்கம்" },
};

function isModuleId(value: string): value is ModuleId {
  return ["chat", "tts", "asr", "ocr", "completion"].includes(value);
}

function hasRenderer(value: string): boolean {
  return isModuleId(value) || value === "news-category" || value === "news-headline";
}


export function Playground() {
  const [locale, setLocale] = useState<Locale>("en");
  const [active, setActive] = useState<PageId>("home");
  const [modules, setModules] = useState<ModuleDescriptor[]>(fallbackModules);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [consent, setConsent] = useState(true);
  const [preferences, setPreferences] = useState<RecordPreferences>({ saveHistory: false, improvementConsent: false });
  const [modulesUsed, setModulesUsed] = useState<ModuleId[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    getModules().then((response) => setModules(response.modules.filter((module) => module.enabled).sort((a, b) => a.sort_order - b.sort_order))).catch(() => setModules(fallbackModules));
  }, []);

  const activeDescriptor = useMemo(() => modules.find((module) => module.module_id === active), [modules, active]);
  const pageTitle = labels[locale][active] ?? activeDescriptor?.module_id ?? "Thamizhi AI";
  function navigate(page: PageId) { setActive(page); setMenuOpen(false); }
  function used(moduleId: PageId, interactionId?: string) {
    if (isModuleId(moduleId)) {
      setModulesUsed((current) => current.includes(moduleId) ? current : [...current, moduleId]);
    }
    if (interactionId) setHistoryRefresh((current) => current + 1);
  }

  if (!signedIn) return <main className="signed-out"><div className="brand-mark-large">த</div><h1>{locale === "en" ? "You are signed out" : "நீங்கள் வெளியேறிவிட்டீர்கள்"}</h1><p>{locale === "en" ? "Thank you for helping us improve Thamizhi AI Playground." : "தமிழி செயற்கை நுண்ணறிவுச் சோதனைக்களத்தை மேம்படுத்த உதவியதற்கு நன்றி."}</p><button className="primary-button" onClick={() => { setSignedIn(true); setActive("home"); setModulesUsed([]); }}>{locale === "en" ? "Return to local demo" : "உள்ளகச் சோதனைக்குத் திரும்பு"}</button></main>;

  return <main className="app-shell">
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="sidebar-brand"><div className="brand-symbol">த</div><div><strong>Thamizhi AI</strong><span>{locale === "en" ? "Research workspace" : "ஆராய்ச்சிப் பணியிடம்"}</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
      <nav aria-label="Primary navigation">
        <NavItem id="home" label={labels[locale].home} icon="home" active={active} onSelect={navigate} />
        <div className="nav-group"><span>{locale === "en" ? "Workspace" : "பணியிடம்"}</span>
          <NavItem id="usage" label={labels[locale].usage} icon="usage" active={active} onSelect={navigate} />
          <NavItem id="activity" label={labels[locale].activity} icon="history" active={active} onSelect={navigate} />
        </div>
        <div className="nav-group"><span>{locale === "en" ? "AI modules" : "AI தொகுதிகள்"}</span>
          {modules.filter((m) => m.module_id !== "news-category" && m.module_id !== "news-headline").map((module) => <NavItem key={module.module_id} id={module.module_id as PageId} label={isModuleId(module.module_id) ? labels[locale][module.module_id] : module.module_id} icon={(isModuleId(module.module_id) ? module.module_id : "plus") as IconName} active={active} onSelect={navigate} />)}
        </div>
        <div className="nav-group"><span>{locale === "en" ? "Other Tools" : "பிற கருவிகள்"}</span>
          <NavItem id="news-category" label={labels[locale]["news-category"]} icon="news-classify" active={active} onSelect={navigate} />
          <NavItem id="news-headline" label={labels[locale]["news-headline"]} icon="news-headline" active={active} onSelect={navigate} />
        </div>
        <div className="nav-group admin-group"><span>{locale === "en" ? "Administration" : "நிர்வாகம்"}</span><button className="nav-item disabled" disabled><Icon name="database" /><span>{locale === "en" ? "Module catalogue" : "தொகுதிப் பட்டியல்"}</span></button><button className="nav-item disabled" disabled><Icon name="settings" /><span>{locale === "en" ? "Providers" : "வழங்குநர்கள்"}</span></button></div>
      </nav>
      <div className="sidebar-lower"><a href="http://localhost:8000/health/ready" target="_blank" rel="noreferrer"><Icon name="status" /><span>API status</span></a><a href="http://localhost:8000/docs" target="_blank" rel="noreferrer"><Icon name="book" /><span>{locale === "en" ? "Documentation" : "ஆவணங்கள்"}</span></a></div>
      <button className="account-button" onClick={() => setFeedbackOpen(true)}><span className="avatar">DR</span><span><strong>{locale === "en" ? "Demo researcher" : "சோதனை ஆராய்ச்சியாளர்"}</strong><small>local-demo-user</small></span><Icon name="logout" /></button>
    </aside>
    <section className="shell-main">
      <header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button><h1>{pageTitle}</h1><div className="topbar-actions">
        <div className="locale-switch" aria-label="Language"><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button><button className={locale === "ta-LK" ? "active" : ""} onClick={() => setLocale("ta-LK")}>தமிழ்</button></div>
        <button className={`data-button ${preferences.saveHistory ? "on" : ""}`} onClick={() => setDataOpen((open) => !open)}><Icon name="shield" /><span>{locale === "en" ? `History ${preferences.saveHistory ? "on" : "off"}` : `வரலாறு ${preferences.saveHistory ? "இயக்கம்" : "நிறுத்தம்"}`}</span></button>
      </div></header>
      {dataOpen && <section className="data-popover" aria-label="Data controls"><div className="popover-heading"><strong>{locale === "en" ? "Data controls" : "தரவுக் கட்டுப்பாடுகள்"}</strong><button className="icon-button" onClick={() => setDataOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
        <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>{locale === "en" ? "Allow session processing" : "அமர்வுச் செயலாக்கத்தை அனுமதி"}</strong><small>{locale === "en" ? "Required to run an AI module." : "AI தொகுதியை இயக்க இது தேவை."}</small></span></label>
        <label><input type="checkbox" checked={preferences.saveHistory} onChange={(event) => setPreferences((current) => ({ saveHistory: event.target.checked, improvementConsent: event.target.checked ? current.improvementConsent : false }))} /><span><strong>{locale === "en" ? "Save my activity history" : "எனது செயற்பாட்டு வரலாற்றைச் சேமி"}</strong><small>{locale === "en" ? "Stores inputs and outputs for 30 days." : "உள்ளீடுகளையும் வெளியீடுகளையும் 30 நாட்களுக்குச் சேமிக்கும்."}</small></span></label>
        <label><input type="checkbox" checked={preferences.improvementConsent} onChange={(event) => setPreferences(() => ({ saveHistory: event.target.checked || preferences.saveHistory, improvementConsent: event.target.checked }))} /><span><strong>{locale === "en" ? "Use saved results for improvement" : "மேம்பாட்டிற்குச் சேமித்த முடிவுகளைப் பயன்படுத்து"}</strong><small>{locale === "en" ? "Separate, revocable opt-in. Never enables model training automatically." : "தனியான, திரும்பப் பெறக்கூடிய ஒப்புதல். மாதிரிப் பயிற்சியைத் தானாக இயக்காது."}</small></span></label>
      </section>}
      <div className="content-canvas">
        {active === "home" && <HomePage locale={locale} modules={modules.filter((m) => m.module_id !== "news-category" && m.module_id !== "news-headline")} onOpen={(id) => isModuleId(id) && navigate(id)} />}
        {active === "usage" && <UsagePage locale={locale} />}
        {active === "activity" && <ActivityPage locale={locale} refreshKey={historyRefresh} />}
        {active === "chat" && <ChatPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("chat", id)} />}
        {active === "tts" && <TTSPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("tts", id)} />}
        {active === "asr" && <ASRPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("asr", id)} />}
        {active === "ocr" && <OCRPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("ocr", id)} />}
        {active === "completion" && <CompletionPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("completion", id)} />}
        {active === "news-category" && <NewsCategoryPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("news-category", id)} />}
        {active === "news-headline" && <NewsHeadlinePanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("news-headline", id)} />}
        {activeDescriptor && !hasRenderer(activeDescriptor.module_id) && <div className="empty-state"><Icon name="plus" className="empty-icon" /><h2>{activeDescriptor.module_id}</h2><p>This registered module needs a renderer.</p></div>}
        {!consent && hasRenderer(active) && <div className="consent-banner" role="status"><Icon name="shield" /><span>{locale === "en" ? "Enable session processing in Data controls to use this module." : "இந்தத் தொகுதியைப் பயன்படுத்த தரவுக் கட்டுப்பாடுகளில் அமர்வுச் செயலாக்கத்தை இயக்கவும்."}</span></div>}
      </div>
    </section>
    {feedbackOpen && <FeedbackDialog locale={locale} modulesUsed={modulesUsed} onCancel={() => setFeedbackOpen(false)} onSignedOut={() => { setFeedbackOpen(false); setSignedIn(false); }} />}
  </main>;
}

function NavItem({ id, label, icon, active, onSelect }: { id: PageId; label: string; icon: IconName; active: PageId; onSelect: (id: PageId) => void }) {
  return <button className={`nav-item ${active === id ? "active" : ""}`} aria-current={active === id ? "page" : undefined} onClick={() => onSelect(id)}><Icon name={icon} /><span>{label}</span></button>;
}
