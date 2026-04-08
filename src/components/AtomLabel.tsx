import { Link } from "react-router-dom";
import { Atom } from "lucide-react";
import { AtomTypeIcon } from "./AtomTypeIcon";
import type { AtomVaultRow } from "@/hooks/useAtoms";

export function AtomLabel({ row }: { row: AtomVaultRow }) {
  const atom = row.term.atom;
  return (
    <Link
      to={`/atoms/${atom.term_id}`}
      className="flex items-center gap-2 hover:underline"
    >
      {atom.image ? (
        <img
          src={atom.image}
          alt=""
          className="w-6 h-6 rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-olive/20 flex items-center justify-center">
          <Atom className="w-3.5 h-3.5 text-olive" />
        </div>
      )}
      <span className="truncate max-w-[200px] text-foreground font-medium">
        {atom.label || "Atom"}
      </span>
      <AtomTypeIcon type={atom.type} />
    </Link>
  );
}
