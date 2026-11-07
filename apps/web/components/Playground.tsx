"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getMe,
  getAdminHistoryConsent,
  setAdminHistoryConsent,
  updateProfile,
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
  { module_id: "chat", descriptor_version: "1.0", capability: "chat", route_slug: "chat", navigation_group: "ai_modules", title_key: "modules.chat.title", description_key: "modules.chat.description", icon_key: "message-circle", sort_order: 30, enabled: false, renderer_kind: "compiled_custom", provider_capability: "chat" },
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
  const [account, setAccount] = useState<{ user_id: string; display_name: string; is_admin: boolean } | null>(null);
  const [consent, setConsent] = useState(true);
  const [preferences, setPreferences] = useState<RecordPreferences>({ saveHistory: false, improvementConsent: false, adminHistoryConsent: false });
  const [historyReady, setHistoryReady] = useState(false);
  const [historyConsentPending, setHistoryConsentPending] = useState(false);
  const [historyConsentError, setHistoryConsentError] = useState("");
  const [modulesUsed, setModulesUsed] = useState<ModuleId[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getModules().then((response) => setModules(response.modules.filter((module) => module.enabled && module.module_id !== "translate-e9ececf1" && module.module_id !== "chat").sort((a, b) => a.sort_order - b.sort_order))).catch(() => setModules(fallbackModules));
  }, []);

  useEffect(() => {
    getMe()
      .then(async (me) => {
        setAccount(me);
        setIsAdmin(me.is_admin);

        const accepted = await getAdminHistoryConsent();
        setPreferences({
          saveHistory: accepted,
          improvementConsent: false,
          adminHistoryConsent: accepted,
        });
        setHistoryReady(true);
      })
      .catch(() => {
        setHistoryConsentError("Unable to load history consent settings.");
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
      window.location.reload();
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
              <strong>{account?.display_name ?? "Account"}</strong>
              <small>{account?.is_admin ? "Administrator" : "User"}</small>
            </div>
            <small>{account?.user_id}</small>
            <button type="button" onClick={async () => {
              const name = window.prompt("Enter your display name", account?.display_name ?? "");
              if (name === null || !name.trim()) return;
              try {
                await updateProfile(name.trim());
                setAccount(await getMe());
              } catch (error) {
                window.alert(error instanceof Error ? error.message : "Could not update profile.");
              }
            }}>
              Edit display name
            </button>
            <button type="button" className="account-signout" disabled={signingOut} onClick={() => void handleSignOut()}>
              <Icon name="logout" />
              <span>{signingOut ? (locale === "en" ? "Signing out..." : "வெளியேறுகிறது...") : (locale === "en" ? "Sign out" : "வெளியேறு")}</span>
            </button>
          </div>
        )}
        <button type="button" className="account-button" aria-expanded={accountMenuOpen} aria-label={locale === "en" ? "Account menu" : "கணக்கு பட்டி"} onClick={() => setAccountMenuOpen((open) => !open)}>
          <span className="avatar">{account?.display_name?.slice(0, 2).toUpperCase() ?? "U"}</span>
          <span><strong>{account?.display_name ?? "Loading..."}</strong>
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
        <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>{locale === "en" ? "Enable AI processing" : "அமர்வுச் செயலாக்கத்தை அனுமதி"}</strong><small>{locale === "en" ? "Required to use AI features. Inputs are processed to generate results and are not saved unless activity history is enabled." : "AI அம்சங்களைப் பயன்படுத்த இது அவசியம். முடிவுகளை உருவாக்க உள்ளீடுகள் செயலாக்கப்படும். செயற்பாட்டு வரலாறு இயக்கப்பட்டிருந்தால் மட்டுமே அவை சேமிக்கப்படும்."}</small></span></label>
        <label><input type="checkbox" checked={preferences.saveHistory} disabled={!historyReady || historyConsentPending}
          onChange={async (event) => {
            const accepted = event.target.checked;
            setHistoryConsentPending(true);
            setHistoryConsentError("");
            try {
              await setAdminHistoryConsent(accepted);
              setPreferences((current) => ({
                ...current,
                saveHistory: accepted,
                adminHistoryConsent: accepted,
                improvementConsent: accepted
                  ? current.improvementConsent
                  : false,
              }));
            } catch {
              setHistoryConsentError(
                locale === "en"
                  ? "Unable to update history consent. Please try again."
                  : "வரலாற்றுச் சேமிப்பு ஒப்புதலைப் புதுப்பிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."
              );
            } finally {
              setHistoryConsentPending(false);
            }
          }} /><span><strong>{locale === "en" ? "Save my activity history" : "எனது செயற்பாட்டு வரலாற்றைச் சேமி"}</strong><small>{locale === "en" ? "Save inputs and outputs until you delete them. Authorized administrators can access newly saved history. Authorized administrators can view saved history for service support and monitoring. This does not permit research use." : "உள்ளீடுகளும் வெளியீடுகளும் நீங்கள் நீக்கும் வரை சேமிக்கப்படும். சேவை ஆதரவு மற்றும் கண்காணிப்புக்காக அங்கீகரிக்கப்பட்ட நிர்வாகிகள் இவ்வரலாற்றைப் பார்க்கலாம். இது ஆராய்ச்சிப் பயன்பாட்டை அனுமதிக்காது."}</small></span></label>
        {historyConsentPending && (
          <small>{locale === "en" ? "Updating consent..." : "ஒப்புதல் புதுப்பிக்கப்படுகிறது..."}</small>
        )}
        {historyConsentError && <p role="alert">{historyConsentError}</p>}
        <label><input type="checkbox" checked={preferences.improvementConsent} disabled={!preferences.saveHistory} onChange={(event) => setPreferences((current) => ({ ...current, improvementConsent: event.target.checked }))} /><span><strong>{locale === "en" ? "Allow my saved data to be used for research" : "எனது சேமிக்கப்பட்ட தரவை ஆராய்ச்சிக்குப் பயன்படுத்த அனுமதி"}</strong><small>{locale === "en" ? "Optional consent. When enabled, newly saved inputs and outputs may be used for research. Saved history has no automatic expiration. Research consent can be withdrawn." : "விருப்பத்திற்குரிய ஒப்புதல். சேமிக்கப்பட்ட உள்ளீடுகளும் வெளியீடுகளும் ஆராய்ச்சிக்குப் பயன்படுத்தப்படலாம்; தானாக நீக்கப்படாது. ஆராய்ச்சி ஒப்புதலைத் திரும்பப் பெறலாம்."}</small></span></label>
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
