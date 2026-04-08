import { Link } from "react-router-dom";
import { Tag, TrendingUp } from "lucide-react";
import type { TripleVaultRow } from "@/hooks/useTriples";

export function TripleLabel({ row }: { row: TripleVaultRow }) {
  const t = row.term.triple;
  return (
    <Link
      to={`/triples/${t.term_id}`}
      className="flex items-center gap-1.5 hover:underline flex-wrap"
    >
      <span className="truncate max-w-[120px] text-olive font-medium">
        {t.subject.label || `#${t.subject.term_id.slice(0, 8)}`}
      </span>
      <Tag className="w-3.5 h-3.5 text-sandy shrink-0" />
      <span className="truncate max-w-[120px] text-sandy">
        {t.predicate.label || `#${t.predicate.term_id.slice(0, 8)}`}
      </span>
      <TrendingUp className="w-3.5 h-3.5 text-teal shrink-0" />
      <span className="truncate max-w-[120px] text-teal font-medium">
        {t.object.label || `#${t.object.term_id.slice(0, 8)}`}
      </span>
    </Link>
  );
}
