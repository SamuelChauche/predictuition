import { Link } from "react-router-dom";

const positiveWords = /\b(UP|Higher|Bullish|gain|more|above|increase|exceed|reach)\b/gi;
const negativeWords = /\b(DOWN|Lower|Bearish|lose|less|below|decrease|drop|fall)\b/gi;

const ATOM_COLOR = "#734BBD";
const TRIPLE_COLOR = "#9B6DD7";

interface EntityRef {
  label: string;
  termId: string;
  path: string;
  kind: "atom" | "triple";
}

interface HighlightOptions {
  entities?: EntityRef[];
}

export function highlightQuestion(
  question: string,
  options?: HighlightOptions
): React.ReactNode {
  const entities = (options?.entities ?? []).filter((e) => e.label);

  // Sort longest first to avoid partial matches
  entities.sort((a, b) => b.label.length - a.label.length);

  // Use word boundaries for short labels to avoid matching inside other words
  const entityPatterns = entities.map((e) => {
    const escaped = e.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return e.label.length <= 3 ? `(\\b${escaped}\\b)` : `(${escaped})`;
  });

  const allPatterns = [
    ...entityPatterns,
    "(\\b(?:UP|Higher|Bullish|gain|more|above|increase|exceed|reach)\\b)",
    "(\\b(?:DOWN|Lower|Bearish|lose|less|below|decrease|drop|fall)\\b)",
  ];

  const regex = new RegExp(allPatterns.join("|"), "gi");
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(question)) !== null) {
    if (match.index > lastIndex) {
      result.push(question.slice(lastIndex, match.index));
    }

    const matched = match[0];
    const entity = entities.find(
      (e) => e.label.toLowerCase() === matched.toLowerCase()
    );

    if (entity) {
      const color = entity.kind === "triple" ? TRIPLE_COLOR : ATOM_COLOR;
      result.push(
        <Link
          key={match.index}
          to={entity.path}
          className="font-black hover:underline"
          style={{ color }}
          onClick={(e) => e.stopPropagation()}
        >
          {matched}
        </Link>
      );
    } else if (positiveWords.test(matched)) {
      positiveWords.lastIndex = 0;
      result.push(
        <span key={match.index} style={{ color: "#90D18D" }} className="font-black">
          {matched}
        </span>
      );
    } else if (negativeWords.test(matched)) {
      negativeWords.lastIndex = 0;
      result.push(
        <span key={match.index} style={{ color: "#bc4b51" }} className="font-black">
          {matched}
        </span>
      );
    } else {
      result.push(matched);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < question.length) {
    result.push(question.slice(lastIndex));
  }

  return result;
}
