import type { Locale, ModuleDescriptor } from "../lib/api";
import { Icon, type IconName } from "./Icon";

const moduleCopy: Record<string, { en: [string, string]; "ta-LK": [string, string] }> = {
  chat: { en: ["Small chat", "Ask focused questions in Tamil or English."], "ta-LK": ["சிறிய உரையாடல்", "தமிழில் அல்லது ஆங்கிலத்தில் கேள்விகளைக் கேளுங்கள்."] },
  tts: { en: ["Text to speech", "Generate playable speech from written text."], "ta-LK": ["எழுத்திலிருந்து பேச்சு", "எழுத்து உரையிலிருந்து பேச்சை உருவாக்குங்கள்."] },
  asr: { en: ["Speech to text", "Record or upload audio for transcription."], "ta-LK": ["பேச்சிலிருந்து எழுத்து", "எழுத்தாக்கத்திற்காக ஒலியைப் பதிவு செய்யுங்கள்."] },
  ocr: { en: ["Image to text", "Extract text from document images."], "ta-LK": ["படத்திலிருந்து எழுத்து", "ஆவணப் படங்களிலிருந்து உரையைப் பிரித்தெடுங்கள்."] },
};

export function HomePage({ locale, modules, onOpen }: { locale: Locale; modules: ModuleDescriptor[]; onOpen: (id: string) => void }) {
  return <div className="page-stack">
    <section className="welcome-block">
      <span className="welcome-kicker">THAMIZHI AI PLAYGROUND</span>
      <h1>{locale === "en" ? "Build with language, speech and vision" : "மொழி, பேச்சு மற்றும் பார்வையுடன் உருவாக்குங்கள்"}</h1>
      <p>{locale === "en" ? "A modular research workspace for experimenting with Tamil and English AI systems." : "தமிழ் மற்றும் ஆங்கில செயற்கை நுண்ணறிவு அமைப்புகளைச் சோதிப்பதற்கான தொகுதிநிலை ஆராய்ச்சிப் பணியிடம்."}</p>
    </section>
    <section>
      <div className="section-heading"><div><h2>{locale === "en" ? "AI modules" : "செயற்கை நுண்ணறிவுத் தொகுதிகள்"}</h2><p>{locale === "en" ? "Choose a capability to begin." : "தொடங்க ஒரு திறனைத் தேர்ந்தெடுக்கவும்."}</p></div></div>
      <div className="module-grid">
        {modules.map((module) => {
          const labels = moduleCopy[module.module_id]?.[locale] ?? [module.module_id, module.capability];
          return <button className="module-card" key={module.module_id} onClick={() => onOpen(module.module_id)}>
            <span className="module-card-icon"><Icon name={(module.module_id in moduleCopy ? module.module_id : "plus") as IconName} /></span>
            <span><strong>{labels[0]}</strong><small>{labels[1]}</small></span>
            <Icon name="chevron" className="module-arrow" />
          </button>;
        })}
      </div>
    </section>
    <section className="privacy-note"><Icon name="shield"/><div><strong>{locale === "en" ? "Privacy-aware by design" : "தனியுரிமையை மையமாகக் கொண்ட வடிவமைப்பு"}</strong><p>{locale === "en" ? "Access events never include your submitted content. Query and answer history is stored only when you enable it." : "அணுகல் பதிவுகளில் நீங்கள் சமர்ப்பித்த உள்ளடக்கம் சேர்க்கப்படாது. நீங்கள் இயக்கினால் மட்டுமே கேள்வி மற்றும் பதில் வரலாறு சேமிக்கப்படும்."}</p></div></section>
  </div>;
}
