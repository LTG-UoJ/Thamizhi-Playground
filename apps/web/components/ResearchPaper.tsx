import { featureResearch } from "../lib/featureResearch";

type ResearchFeature = keyof typeof featureResearch;

export function ResearchPaper({
  feature,
  locale,
}: {
  feature: ResearchFeature;
  locale: "en" | "ta-LK";
}) {
  const paper = featureResearch[feature];

  return (
    <aside className="research-paper" aria-label="Related research publication">
      <div className="research-paper-content">
        <span className="research-paper-label">
          {locale === "en" ? "RESEARCH PUBLICATION" : "ஆய்வு வெளியீடு"}
        </span>
        <h3>{paper.title}</h3>
        <p>{paper.authors} ({paper.year})</p>
        <p>{paper.relationship}</p>
        <a href={paper.url} target="_blank" rel="noopener noreferrer">
          {locale === "en" ? "Read Research Paper ↗" : "ஆய்வுக் கட்டுரையைப் படிக்க ↗"}
        </a>
      </div>
    </aside>
  );
}
