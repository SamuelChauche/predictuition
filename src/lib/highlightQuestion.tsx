const positiveWords = /\b(UP|Higher|Bullish|gain|more|above|increase|exceed|reach)\b/gi;
const negativeWords = /\b(DOWN|Lower|Bearish|lose|less|below|decrease|drop|fall)\b/gi;

export function highlightQuestion(question: string): React.ReactNode {
  const parts = question.split(/(\b(?:UP|Higher|Bullish|gain|more|above|increase|exceed|reach|DOWN|Lower|Bearish|lose|less|below|decrease|drop|fall)\b)/gi);

  return parts.map((part, i) => {
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
