import { cn } from "@/utils";

interface UserAvatarProps {
  id: number;
  name: string;
  hasAvatar: boolean;
  version: number;
  size?: number;
  className?: string;
}

const COLORS = ["bg-brand-100 text-brand-700", "bg-success-100 text-success-700", "bg-warning-100 text-warning-700", "bg-blue-light-100 text-blue-light-700", "bg-orange-100 text-orange-700"];

export default function UserAvatar({ id, name, hasAvatar, version, size = 32, className }: UserAvatarProps) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (hasAvatar) {
    return <img src={`/api/users/${id}/avatar?v=${version}`} alt="" style={style} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span style={style} className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", COLORS[id % COLORS.length], className)} aria-hidden>
      {initial}
    </span>
  );
}
