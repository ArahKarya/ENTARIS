// Daftar sesi (paging "muat lebih banyak", pencarian ber-debounce, filter aktif/arsip) + aksi ubah nama/arsip/hapus.

import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/useDebounce';
import { chatKeys, fetchSessions, patchSession, removeSession } from './chatApi';
import type { ChatSessionDto, SessionStatus } from './types';

const errMsg = (e: unknown, fallback: string): string => {
  const m = (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return m?.message || m?.error || fallback;
};

export function useSessionList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SessionStatus>('active');
  const q = useDebounce(search.trim(), 300);

  const query = useInfiniteQuery({
    queryKey: chatKeys.sessions(q, status),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchSessions({ q, status, page: pageParam }),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    staleTime: 10_000,
  });

  const sessions = useMemo<ChatSessionDto[]>(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flatMap((p) => p.data).filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  }, [query.data]);

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['aira', 'sessions'] }), [qc]);

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => patchSession(id, { title }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e, 'Gagal mengubah nama sesi.')),
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => patchSession(id, { status: archived ? 'archived' : 'active' }),
    onSuccess: (_d, v) => {
      toast.success(v.archived ? 'Sesi diarsipkan.' : 'Sesi dipulihkan.');
      void invalidate();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal memperbarui sesi.')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeSession(id),
    onSuccess: () => {
      toast.success('Percakapan dihapus.');
      void invalidate();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menghapus sesi.')),
  });

  return {
    sessions,
    loading: query.isLoading,
    hasMore: !!query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    search,
    setSearch,
    status,
    setStatus,
    invalidate,
    rename: (id: string, title: string) => rename.mutate({ id, title }),
    archive: (id: string, archived: boolean) => archive.mutate({ id, archived }),
    remove: (id: string) => remove.mutateAsync(id),
  };
}
