import { User, Box, FileText, ImageIcon, Users, Link as LinkIcon, Hash } from "lucide-react";

const atomTypeIcons: Record<string, React.ReactNode> = {
  Account: <User className="w-3.5 h-3.5" />,
  Thing: <Box className="w-3.5 h-3.5" />,
  TextObject: <FileText className="w-3.5 h-3.5" />,
  ImageObject: <ImageIcon className="w-3.5 h-3.5" />,
  Organization: <Users className="w-3.5 h-3.5" />,
  Person: <User className="w-3.5 h-3.5" />,
  URL: <LinkIcon className="w-3.5 h-3.5" />,
};

export function getAtomTypeIcon(type: string, size = "w-3.5 h-3.5") {
  const icons: Record<string, React.ReactNode> = {
    Account: <User className={size} />,
    Thing: <Box className={size} />,
    TextObject: <FileText className={size} />,
    ImageObject: <ImageIcon className={size} />,
    Organization: <Users className={size} />,
    Person: <User className={size} />,
    URL: <LinkIcon className={size} />,
  };
  return icons[type] || <Hash className={size} />;
}

export function AtomTypeIcon({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-teal bg-teal/10 px-1.5 py-0.5 rounded-md font-medium">
      {atomTypeIcons[type] || <Hash className="w-3.5 h-3.5" />}
      {type}
    </span>
  );
}
