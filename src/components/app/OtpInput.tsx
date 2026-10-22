import { useRef } from "react";

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

// Six single-digit boxes; numeric keypad on phones, one-time-code autofill, paste-friendly.
export default function OtpInput({ value, onChange, onComplete, disabled, autoFocus }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const update = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete?.(clean);
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="รหัสยืนยัน 6 หลัก">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          aria-label={`หลักที่ ${i + 1}`}
          className="num h-13 w-full min-w-0 rounded-lg border border-gray-300 bg-transparent text-center text-xl font-semibold text-gray-800 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (v.length > 1) return update(value.slice(0, i) + v);
            update(value.slice(0, i) + v + value.slice(i + 1));
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            update(e.clipboardData.getData("text"));
            refs.current[Math.min(5, e.clipboardData.getData("text").replace(/\D/g, "").length)]?.focus();
          }}
        />
      ))}
    </div>
  );
}
