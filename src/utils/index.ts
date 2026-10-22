import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The theme adds its own font sizes (text-theme-sm, text-title-sm ...). Tell the merger they are sizes,
// otherwise it mistakes them for colours and drops one of "text-theme-xs text-gray-500".
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["theme-xs", "theme-sm", "theme-xl", "title-sm", "title-md", "title-lg", "title-xl", "title-2xl"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs));
}
