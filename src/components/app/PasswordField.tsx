import { EyeGlyph, EyeOffGlyph } from "@/icons";
import { cn } from "@/utils";
import { useState, type InputHTMLAttributes } from "react";
import { FieldShell } from "./Field";

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
  error?: string | null;
}

export default function PasswordField({ label, hint, error, className, ...rest }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(id) => (
        <div className="relative">
          <input
            id={id}
            type={show ? "text" : "password"}
            aria-invalid={Boolean(error)}
            className={cn("app-input pe-11", error && "border-error-500", className)}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            className="absolute inset-e-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 [&_svg]:size-[18px]"
          >
            {show ? <EyeOffGlyph /> : <EyeGlyph />}
          </button>
        </div>
      )}
    </FieldShell>
  );
}
