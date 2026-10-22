import { cn } from "@/utils";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: (id: string) => ReactNode;
  className?: string;
}

export function FieldShell({ label, hint, error, children, className }: FieldShellProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="mt-1.5 text-theme-xs text-error-600 dark:text-error-500">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  wrapperClassName?: string;
}
export function TextField({ label, hint, error, wrapperClassName, className, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={wrapperClassName}>
      {(id) => (
        <input
          id={id}
          aria-invalid={Boolean(error)}
          className={cn("app-input", error && "border-error-500 focus:border-error-500", className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  wrapperClassName?: string;
}
export function SelectField({ label, hint, wrapperClassName, className, children, ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} className={wrapperClassName}>
      {(id) => (
        <select id={id} className={cn("app-input pe-8", className)} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}
export function TextAreaField({ label, hint, className, ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint}>
      {(id) => <textarea id={id} rows={3} className={cn("app-input h-auto py-2.5", className)} {...rest} />}
    </FieldShell>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}
export function Toggle({ checked, onChange, label, hint, disabled }: ToggleProps) {
  return (
    <label className={cn("flex items-start gap-3", disabled ? "opacity-60" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-all",
            checked ? "inset-s-[1.125rem]" : "inset-s-0.5",
          )}
        />
      </button>
      <span>
        <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">{label}</span>
        {hint && <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}
