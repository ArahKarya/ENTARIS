import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const PARAM = 'asset';

/**
 * Selected asset of a master-detail page, kept in ?asset=<id> so the view can
 * be linked and survives a refresh. When nothing (or an unknown id) is
 * selected, the first asset is selected (history entry replaced).
 */
export function useAssetSelection(assetIds: readonly string[] | undefined) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(PARAM);
  const selectedId = raw && assetIds?.includes(raw) ? raw : null;

  const select = useCallback(
    (id: string | null, replace = false) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set(PARAM, id);
          else next.delete(PARAM);
          return next;
        },
        { replace },
      ),
    [setSearchParams],
  );

  const first = assetIds?.[0] ?? null;
  useEffect(() => {
    if (!assetIds) return; // still loading
    if (selectedId) return;
    if (first) select(first, true);
    else if (raw) select(null, true);
  }, [assetIds, selectedId, first, raw, select]);

  return { selectedId, select };
}
