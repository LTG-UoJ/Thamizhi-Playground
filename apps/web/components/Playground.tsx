"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getMe,
  getModules,
  type Locale,
  type ModuleDescriptor,
  type ModuleId,
  type RecordPreferences,
} from "../lib/api";
import { signOutServer, clearToken } from "../lib/auth";
import { ActivityPage } from "./ActivityPage";
import { ASRPanel } from "./ASRPanel";
import { ChatPanel } from "./ChatPanel";
import { CompletionPanel } from "./CompletionPanel";
import { FeedbackDialog } from "./FeedbackDialog";
import { HomePage } from "./HomePage";
import { Icon, type IconName } from "./Icon";
import { NewsCategoryPanel } from "./NewsCategoryPanel";
import { NewsHeadlinePanel } from "./NewsHeadlinePanel";
import OCRPanel from "./OCRPanel";
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
  en: { home: "Home", usage: "Usage", activity: "Activity history", chat: "Small chat", tts: "Text to Speech", asr: "Speech to Text", ocr: "Image to Text", completion: "Text Completion", "news-category": "News Category Classification", "news-headline": "News Headline Generation" },
  "ta-LK": { home: "முகப்பு", usage: "பயன்பாடு", activity: "செயற்பாட்டு வரலாறு", chat: "சிறிய உரையாடல்", tts: "எழுத்திலிருந்து பேச்சு", asr: "பேச்சிலிருந்து எழுத்து", ocr: "படத்திலிருந்து உரை", completion: "உரைத் தொடர்ச்சி", "news-category": "செய்தி வகைப்படுத்தல்", "news-headline": "செய்தித் தலைப்பு உருவாக்கம்" },
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [account, setAccount] = useState<{ user_id: string; is_admin: boolean } | null>(null);
  const [consent, setConsent] = useState(true);
  const [preferences, setPreferences] = useState<RecordPreferences>({ saveHistory: false, improvementConsent: false });
  const [historyReady, setHistoryReady] = useState(false);
  const [modulesUsed, setModulesUsed] = useState<ModuleId[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getModules().then((response) => setModules(response.modules.filter((module) => module.enabled && module.module_id !== "translate-e9ececf1").sort((a, b) => a.sort_order - b.sort_order))).catch(() => setModules(fallbackModules));
  }, []);

  useEffect(() => {
    getMe()
      .then((me) => {
        setAccount(me);
        setIsAdmin(me.is_admin);

        const key = `thamizhi:history:${encodeURIComponent(me.user_id)}`;
        let saved: string | null = null;

        try {
          saved = window.localStorage.getItem(key);
        } catch {
          // Browser storage may be unavailable.
        }

        setPreferences({
          saveHistory: saved === null ? true : saved === "true",
          improvementConsent: false,
        });
        setHistoryReady(true);
      })
      .catch(() => {
        setAccount(null);
        setIsAdmin(false);
        setHistoryReady(false);
      });
  }, []);

  useEffect(() => {
    if (!account || !historyReady) return;

    const key = `thamizhi:history:${encodeURIComponent(account.user_id)}`;

    try {
      window.localStorage.setItem(key, String(preferences.saveHistory));
    } catch {
      // Continue without persistence when storage is unavailable.
    }
  }, [account, historyReady, preferences.saveHistory]);

  const adminOnly = active === "usage" || active === "activity";
  useEffect(() => {
    if (adminOnly && !isAdmin) setActive("home");
  }, [adminOnly, isAdmin]);

  const activeDescriptor = useMemo(() => modules.find((module) => module.module_id === active), [modules, active]);
  const pageTitle = labels[locale][active] ?? activeDescriptor?.module_id ?? "Thamizhi AI";
  function navigate(page: PageId) { setActive(page); setMenuOpen(false); }
  function used(moduleId: PageId, interactionId?: string) {
    if (isModuleId(moduleId)) {
      setModulesUsed((current) => current.includes(moduleId) ? current : [...current, moduleId]);
    }
    if (interactionId) setHistoryRefresh((current) => current + 1);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutServer();
    } catch {
      clearToken();
    } finally {
      window.location.assign("/");
    }
  }

  return <main className="app-shell">
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="sidebar-brand"><div className="brand-symbol">த</div><div><strong>Thamizhi AI</strong><span>{locale === "en" ? "Research workspace" : "ஆராய்ச்சிப் பணியிடம்"}</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
      <nav aria-label="Primary navigation">
        <NavItem id="home" label={labels[locale].home} icon="home" active={active} onSelect={navigate} />
        <div className="nav-group"><span>{locale === "en" ? "Workspace" : "பணியிடம்"}</span>
          {isAdmin && <NavItem id="usage" label={labels[locale].usage} icon="usage" active={active} onSelect={navigate} />}
          {isAdmin && <NavItem id="activity" label={labels[locale].activity} icon="history" active={active} onSelect={navigate} />}
        </div>
        <div className="nav-group"><span>{locale === "en" ? "AI modules" : "AI தொகுதிகள்"}</span>
          {modules.filter((m) => m.module_id !== "news-category" && m.module_id !== "news-headline").map((module) => <NavItem key={module.module_id} id={module.module_id as PageId} label={isModuleId(module.module_id) ? labels[locale][module.module_id] : module.module_id} icon={(isModuleId(module.module_id) ? module.module_id : "plus") as IconName} active={active} onSelect={navigate} />)}
        </div>
        <div className="nav-group"><span>{locale === "en" ? "Other Tools" : "பிற கருவிகள்"}</span>
          <NavItem id="news-category" label={labels[locale]["news-category"]} icon="news-classify" active={active} onSelect={navigate} />
          <NavItem id="news-headline" label={labels[locale]["news-headline"]} icon="news-headline" active={active} onSelect={navigate} />
        </div>
        {isAdmin && <div className="nav-group admin-group"><span>{locale === "en" ? "Administration" : "நிர்வாகம்"}</span><button className="nav-item disabled" disabled><Icon name="database" /><span>{locale === "en" ? "Module catalogue" : "தொகுதிப் பட்டியல்"}</span></button><button className="nav-item disabled" disabled><Icon name="settings" /><span>{locale === "en" ? "Providers" : "வழங்குநர்கள்"}</span></button></div>}
      </nav>
      {isAdmin && <div className="sidebar-lower"><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/health/ready`} target="_blank" rel="noreferrer"><Icon name="status" /><span>API status</span></a>{process.env.NEXT_PUBLIC_API_DOCS_URL && <a href={process.env.NEXT_PUBLIC_API_DOCS_URL} target="_blank" rel="noreferrer"><Icon name="book" /><span>{locale === "en" ? "Documentation" : "ஆவணங்கள்"}</span></a>}</div>}
      <div className="account-menu-wrapper">
        {accountMenuOpen && (
          <div className="account-dropdown">
            <div className="account-dropdown-heading">
              <strong>{account?.user_id ?? "Account"}</strong>
              <small>{account?.is_admin ? "Administrator" : "User"}</small>
            </div>
            <button type="button" className="account-signout" disabled={signingOut} onClick={() => void handleSignOut()}>
              <Icon name="logout" />
              <span>{signingOut ? (locale === "en" ? "Signing out..." : "வெளியேறுகிறது...") : (locale === "en" ? "Sign out" : "வெளியேறு")}</span>
            </button>
          </div>
        )}
        <button type="button" className="account-button" aria-expanded={accountMenuOpen} aria-label={locale === "en" ? "Account menu" : "கணக்கு பட்டி"} onClick={() => setAccountMenuOpen((open) => !open)}>
          <span className="avatar">{account?.user_id?.slice(0, 2).toUpperCase() ?? "U"}</span>
          <span><strong>{account?.user_id ?? "Loading..."}</strong>
          <small>{account?.is_admin ? "Administrator" : "User"}</small></span>
          <Icon name="settings" />
        </button>
      </div>
    </aside>
    <section className="shell-main">
      <header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button><h1>{pageTitle}</h1><div className="topbar-actions">
        <div className="locale-switch" aria-label="Language"><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button><button className={locale === "ta-LK" ? "active" : ""} onClick={() => setLocale("ta-LK")}>தமிழ்</button></div>
        <button className={`data-button ${preferences.saveHistory ? "on" : ""}`} onClick={() => setDataOpen((open) => !open)}><Icon name="shield" /><span>{locale === "en" ? `History ${preferences.saveHistory ? "on" : "off"}` : `வரலாறு ${preferences.saveHistory ? "இயக்கம்" : "நிறுத்தம்"}`}</span></button>
      </div></header>
      {dataOpen && <section className="data-popover" aria-label="Data controls"><div className="popover-heading"><strong>{locale === "en" ? "Data controls" : "தரவுக் கட்டுப்பாடுகள்"}</strong><button className="icon-button" onClick={() => setDataOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
        <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>{locale === "en" ? "Enable AI processing" : "அமர்வுச் செயலாக்கத்தை அனுமதி"}</strong><small>{locale === "en" ? "Required to use AI features. Your inputs are processed to generate results." : "AI தொகுதியை இயக்க இது தேவை."}</small></span></label>
        <label><input type="checkbox" checked={preferences.saveHistory} onChange={(event) => setPreferences((current) => ({ saveHistory: event.target.checked, improvementConsent: event.target.checked ? current.improvementConsent : false }))} /><span><strong>{locale === "en" ? "Save my activity history" : "எனது செயற்பாட்டு வரலாற்றைச் சேமி"}</strong><small>{locale === "en" ? "Stores inputs and outputs for 30 days." : "உள்ளீடுகளையும் வெளியீடுகளையும் 30 நாட்களுக்குச் சேமிக்கும்."}</small></span></label>
        <label><input type="checkbox" checked={preferences.improvementConsent} disabled={!preferences.saveHistory} onChange={(event) => setPreferences((current) => ({ ...current, improvementConsent: event.target.checked }))} /><span><strong>{locale === "en" ? "Contribute saved results to research" : "மேம்பாட்டிற்குச் சேமித்த முடிவுகளைப் பயன்படுத்து"}</strong><small>{locale === "en" ? "Optional research consent. Saved records may be retained for up to 180 days. Does not automatically enable model training." : "தனியான, திரும்பப் பெறக்கூடிய ஒப்புதல். மாதிரிப் பயிற்சியைத் தானாக இயக்காது."}</small></span></label>
      </section>}
      <div className="content-canvas">
        {active === "home" && <HomePage locale={locale} modules={modules.filter((m) => m.module_id !== "news-category" && m.module_id !== "news-headline")} onOpen={(id) => isModuleId(id) && navigate(id)} />}
        {isAdmin && active === "usage" && <UsagePage locale={locale} />}
        {isAdmin && active === "activity" && <ActivityPage locale={locale} refreshKey={historyRefresh} />}
        {historyReady && active === "chat" && <ChatPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("chat", id)} />}
        {historyReady && active === "tts" && <TTSPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("tts", id)} />}
        {historyReady && active === "asr" && <ASRPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("asr", id)} />}
        {historyReady && active === "ocr" && <OCRPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id?: string) => used("ocr", id)} />}
        {historyReady && active === "completion" && <CompletionPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("completion", id)} />}
        {historyReady && active === "news-category" && <NewsCategoryPanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("news-category", id)} />}
        {historyReady && active === "news-headline" && <NewsHeadlinePanel locale={locale} enabled={consent} preferences={preferences} onUsed={(id) => used("news-headline", id)} />}
        {activeDescriptor && !hasRenderer(activeDescriptor.module_id) && <div className="empty-state"><Icon name="plus" className="empty-icon" /><h2>{activeDescriptor.module_id}</h2><p>This registered module needs a renderer.</p></div>}
        {!consent && hasRenderer(active) && <div className="consent-banner" role="status"><Icon name="shield" /><span>{locale === "en" ? "Enable session processing in Data controls to use this module." : "இந்தத் தொகுதியைப் பயன்படுத்த தரவுக் கட்டுப்பாடுகளில் அமர்வுச் செயலாக்கத்தை இயக்கவும்."}</span></div>}
      </div>
    </section>
    {feedbackOpen && <FeedbackDialog locale={locale} modulesUsed={modulesUsed} onCancel={() => setFeedbackOpen(false)} onSignedOut={() => { setFeedbackOpen(false); }} />}
  </main>;
}

function NavItem({ id, label, icon, active, onSelect }: { id: PageId; label: string; icon: IconName; active: PageId; onSelect: (id: PageId) => void }) {
  return <button className={`nav-item ${active === id ? "active" : ""}`} aria-current={active === id ? "page" : undefined} onClick={() => onSelect(id)}><Icon name={icon} /><span>{label}</span></button>;
}
