// Tipe panel chat AIRA (kontrak /api/ai/chat/* — server menyimpan sesi & pesan).

export type SessionStatus = 'active' | 'archived';

export interface ChatSessionDto {
  id: string;
  title: string | null;
  titleSource: 'auto' | 'user';
  status: SessionStatus;
  messageCount: number;
  lastMessageAt: string;
  lastOpenedAt: string | null;
  createdAt: string;
  busy: boolean;
}

export type MessageStatus = 'ok' | 'error' | 'aborted' | 'streaming';

export interface CardPart {
  kind:
    | 'cash_book_draft'
    | 'production_draft'
    | 'payment_request_draft'
    | 'purchase_order_draft'
    | 'quotation_draft'
    | 'sales_order_draft'
    | 'approval'
    | 'link';
  title: string;
  summary?: string;
  /** path internal Entaris */
  href: string;
  status?: string;
  entityId?: string;
  facts?: Array<{ label: string; value: string }>;
}

export interface ToolChip {
  name: string;
  label: string;
  state: 'start' | 'done' | 'error';
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface ChatMessageDto {
  id: string;
  seq?: number;
  turnId?: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  error?: string | null;
  durationMs?: number | null;
  createdAt?: string;
  attachments: AttachmentDto[];
  parts?: { tools?: ToolChip[]; cards?: CardPart[] } | null;
}

/** Pesan di layar: DTO server + status lokal saat streaming. */
export interface ViewMessage extends ChatMessageDto {
  tools: ToolChip[];
  cards: CardPart[];
  /** attachment yang baru dipilih (belum ada id server) */
  localAttachment?: { name: string; size: number; previewUrl?: string };
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface EngineHealth {
  configured: boolean;
  online: boolean;
  latencyMs: number | null;
  reason?: string;
  acceptsPdf: boolean;
  checkedAt: string;
  url?: string;
}

/** Event SSE dari POST /api/ai/chat/stream. */
export type StreamEvent =
  | { event: 'session'; data: { session_id: string; title: string | null } }
  | { event: 'turn'; data: { turn_id: string; message_id: string; user_message_id: string } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'tool'; data: ToolChip }
  | { event: 'card'; data: CardPart }
  | { event: 'title'; data: { title: string } }
  | { event: 'done'; data: { message_id: string; duration_ms: number } }
  | { event: 'error'; data: { message: string; code: string; message_id?: string } };
