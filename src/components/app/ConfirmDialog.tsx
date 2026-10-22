import Button from "./Button";
import Sheet from "./Sheet";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({ open, title, body, confirmLabel, tone = "danger", busy, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button variant={tone} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-theme-sm leading-relaxed text-gray-600 dark:text-gray-400">{body}</p>
    </Sheet>
  );
}
