import { useRef, useState } from "react";
import {
  FileText,
  ImageIcon,
  Paperclip,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  attachmentUrl,
  formatFileSize,
  type PaymentRequestAttachment,
} from "./payment-request";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

interface AttachmentPickerProps {
  /** Already uploaded (existing request). */
  saved: PaymentRequestAttachment[];
  /** Picked but not uploaded yet (sent on save). */
  pending: File[];
  onPendingChange: (files: File[]) => void;
  onRemoveSaved?: (id: string) => void;
  removingId?: string | null;
  required?: boolean;
  error?: string;
  /** List only (detail page): no drop zone, no remove. */
  readOnly?: boolean;
}

const iconFor = (mime: string) =>
  mime.startsWith("image/") ? ImageIcon : FileText;

/** Drag & drop / pick receipts (JPG, PNG, WebP, PDF, max 5 MB each). */
export function AttachmentPicker({
  saved,
  pending,
  onPendingChange,
  onRemoveSaved,
  removingId,
  required,
  error,
  readOnly,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const bad = files.find((f) => !ACCEPTED_TYPES.includes(f.type));
    if (bad)
      return setLocalError(`"${bad.name}" bukan JPG, PNG, WebP, atau PDF.`);
    const big = files.find((f) => f.size > MAX_FILE_BYTES);
    if (big) return setLocalError(`"${big.name}" lebih dari 5 MB.`);
    if (saved.length + pending.length + files.length > MAX_ATTACHMENTS) {
      return setLocalError(
        `Maksimal ${MAX_ATTACHMENTS} lampiran per pengajuan.`,
      );
    }
    setLocalError("");
    onPendingChange([...pending, ...files]);
  };

  const shownError = localError || error;
  return (
    <div className="space-y-3">
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-muted/40 px-4 py-6 text-center transition-colors",
            dragging && "border-primary bg-primary/5",
          )}
        >
          <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-foreground">
            Tarik nota/kuitansi ke sini atau{" "}
            <Button
              type="button"
              variant="link"
              onClick={() => inputRef.current?.click()}
            >
              pilih file
            </Button>
          </p>
          <p className="text-xs text-muted-foreground">
            JPG, PNG, WebP, atau PDF · maks. 5 MB per file
            {required ? " · wajib untuk jenis ini" : ""}
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            className="sr-only"
            aria-label="Pilih file lampiran"
            tabIndex={-1}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {(saved.length > 0 || pending.length > 0) && (
        <ul
          className="divide-y divide-border rounded-lg border border-border"
          aria-label="Lampiran"
        >
          {saved.map((a) => {
            const Icon = iconFor(a.mimeType);
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <a
                  href={attachmentUrl(a.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-primary hover:underline"
                >
                  {a.fileName}
                </a>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  {formatFileSize(a.fileSize)}
                </span>
                {onRemoveSaved && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Hapus ${a.fileName}`}
                    loading={removingId === a.id}
                    onClick={() => onRemoveSaved(a.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            );
          })}
          {pending.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <Paperclip
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                belum diunggah · {formatFileSize(f.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Batalkan ${f.name}`}
                onClick={() =>
                  onPendingChange(pending.filter((_, j) => j !== i))
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {shownError && (
        <p role="alert" className="text-sm text-danger">
          {shownError}
        </p>
      )}
    </div>
  );
}
