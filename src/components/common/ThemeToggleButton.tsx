import IconButton from "@/components/app/IconButton";
import { useTheme } from "@/context/ThemeContext";
import { MoonGlyph, SunGlyph } from "@/icons";

export const ThemeToggleButton: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <IconButton label={theme === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"} onClick={toggleTheme}>
      {theme === "dark" ? <SunGlyph /> : <MoonGlyph />}
    </IconButton>
  );
};
