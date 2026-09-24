import type { Locale } from "./api";

export const copy = {
  en: {
    eyebrow: "LOCAL-FIRST · CONSENT-AWARE",
    title: "Modular AI Playground",
    subtitle: "Explore speech, language and vision models through one careful interface.",
    consent: "I consent to processing the material I submit for this session.",
    consentNote: "Demo mode processes data with the configured provider and does not save prompts by default.",
    required: "Confirm consent to use a module.",
    tts: "Text to speech",
    asr: "Speech to text",
    chat: "Small chat",
    ocr: "Image to text",
    local: "Configured local provider",
  },
  "ta-LK": {
    eyebrow: "உள்ளகச் செயலாக்கம் · ஒப்புதல் பாதுகாப்பு",
    title: "பன்முகச் செயற்கை நுண்ணறிவுச் சோதனைக்களம்",
    subtitle: "பேச்சு, மொழி, படிம மாதிரிகளை ஒரே பாதுகாப்பான இடைமுகத்தில் சோதியுங்கள்.",
    consent: "இந்த அமர்வில் நான் சமர்ப்பிக்கும் தரவைச் செயலாக்க ஒப்புக்கொள்கிறேன்.",
    consentNote: "சோதனை நிலையில் உள்ளமைக்கப்பட்ட வழங்குநர் பயன்படுத்தப்படுகிறார்; உள்ளீடுகள் இயல்பாகச் சேமிக்கப்படாது.",
    required: "தொகுதியைப் பயன்படுத்த ஒப்புதலை உறுதிப்படுத்தவும்.",
    tts: "எழுத்திலிருந்து பேச்சு",
    asr: "பேச்சிலிருந்து எழுத்து",
    chat: "சிறிய உரையாடல்",
    ocr: "படத்திலிருந்து எழுத்து",
    local: "உள்ளமைக்கப்பட்ட உள்ளக வழங்குநர்",
  },
} as const satisfies Record<Locale, Record<string, string>>;

