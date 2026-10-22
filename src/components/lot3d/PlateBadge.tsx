import { cn } from "@/utils";

// A Thai licence plate at reading size: white plate, black rim, number big, province below.
export default function PlateBadge({ plate, province, className, size = "lg" }: { plate: string; province?: string; className?: string; size?: "sm" | "lg" }) {
  const text = plate.trim();
  return (
    <div
      className={cn(
        "inline-flex min-w-0 flex-col items-center justify-center rounded-lg border-2 border-gray-900 bg-[#fbfaf3] text-gray-900 shadow-theme-xs",
        size === "lg" ? "px-5 py-2" : "px-2.5 py-0.5",
        className,
      )}
      role="img"
      aria-label={`ทะเบียน ${text || "ไม่ระบุ"}${province ? ` ${province}` : ""}`}
    >
      <span className={cn("leading-tight font-bold tracking-wider whitespace-nowrap", size === "lg" ? "text-3xl" : "text-theme-sm")}>{text || "ไม่มีทะเบียน"}</span>
      {province && size === "lg" && <span className="-mt-0.5 text-theme-sm leading-tight font-semibold">{province}</span>}
    </div>
  );
}
