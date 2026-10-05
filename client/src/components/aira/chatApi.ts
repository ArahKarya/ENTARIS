// Panggilan REST panel chat (axios; stream SSE ada di sse.ts).

import api from '@/lib/api';
import type { ChatMessageDto, ChatSessionDto, EngineHealth, Paged, SessionStatus } from './types';

export interface MessagesPage {
  data: ChatMessageDto[];
  hasMore: boolean;
  session?: ChatSessionDto | null;
}

export const chatKeys = {
  sessions: (q: string, status: SessionStatus) => ['aira', 'sessions', q, status] as const,
  health: ['aira', 'health'] as const,
};

export async function fetchSessions(params: { q: string; status: SessionStatus; page: number }): Promise<Paged<ChatSessionDto>> {
  const { data } = await api.get<Paged<ChatSessionDto>>('/ai/chat/sessions', {
    params: { q: params.q || undefined, status: params.status, page: params.page, limit: 30 },
  });
  return data;
}

export async function fetchLastSession(): Promise<ChatSessionDto | null> {
  const { data } = await api.get<{ data: ChatSessionDto | null }>('/ai/chat/sessions/last');
  return data.data;
}

export async function fetchMessages(sessionId: string, before?: number): Promise<MessagesPage> {
  const { data } = await api.get<MessagesPage>(`/ai/chat/sessions/${sessionId}/messages`, { params: { before, limit: 50 } });
  return data;
}

export async function patchSession(id: string, patch: { title?: string; status?: SessionStatus }): Promise<ChatSessionDto> {
  const { data } = await api.patch<{ data: ChatSessionDto }>(`/ai/chat/sessions/${id}`, patch);
  return data.data;
}

export async function removeSession(id: string): Promise<void> {
  await api.delete(`/ai/chat/sessions/${id}`);
}

export async function fetchHealth(): Promise<EngineHealth> {
  const { data } = await api.get<EngineHealth>('/ai/chat/health');
  return data;
}

export async function downloadSession(id: string, format: 'md' | 'json'): Promise<void> {
  const res = await api.get(`/ai/chat/sessions/${id}/export`, { params: { format }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `percakapan-aira.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export const attachmentUrl = (id: string): string => `/api/ai/chat/attachments/${id}`;
