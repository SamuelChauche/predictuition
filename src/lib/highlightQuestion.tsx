import { Link } from "react-router-dom";

const positiveWords = /\b(UP|Higher|Bullish|gain|more|above|increase|exceed|reach)\b/gi;
const negativeWords = /\b(DOWN|Lower|Bearish|lose|less|below|decrease|drop|fall)\b/gi;

interface HighlightOptions {
  atoms?: { label: string; termId: string }[];
}

export function highlightQuestion(
  question: string,
  options?: HighlightOptions
): React.ReactNode {
  // First pass: replace atom labels with placeholders
  const atoms = options?.atoms ?? [];
  let processed = question;
  const atomMap = new Map<string, { label: string; termId: string }>();

  atoms.forEach((atom, i) => {
    if (!atom.label) return;
    const placeholder = `__ATOM_${i}__`;
    // Replace the atom label in the question (case-sensitive, whole word when possible)
    const escaped = atom.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    processed = processed.replace(new RegExp(escaped, "g"), placeholder);
    atomMap.set(placeholder, atom);
  });

  // Split on atom placeholders + positive/negative words
  const allPatterns = [
    ...Array.from(atomMap.keys()).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "\\b(?:UP|Higher|Bullish|gain|more|above|increase|exceed|reach)\\b",
    "\\b(?:DOWN|Lower|Bearish|lose|less|below|decrease|drop|fall)\\b",
  ];

  const regex = new RegExp(`(${allPatterns.join("|")})`, "gi");
  const parts = processed.split(regex);

  return parts.map((part, i) => {
    // Check if it's an atom placeholder
    const atomEntry = atomMap.get(part);
    if (atomEntry) {
      return (
        <Link
          key={i}
          to={`/atoms/${atomEntry.termId}`}
          className="text-olive font-black hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {atomEntry.label}
        </Link>
      );
    }

    // Check positive/negative
    if (positiveWords.test(part)) {
      positiveWords.lastIndex = 0;
      return (
        <span key={i} style={{ color: "#90D18D" }} className="font-black">
          {part}
        </span>
      );
    }
    if (negativeWords.test(part)) {
      negativeWords.lastIndex = 0;
      return (
        <span key={i} style={{ color: "#bc4b51" }} className="font-black">
          {part}
        </span>
      );
    }
    return part;
  });
}
