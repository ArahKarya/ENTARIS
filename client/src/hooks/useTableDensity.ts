import { useCallback, useState } from 'react';

export type TableDensity = 'comfortable' | 'compact';

export const TABLE_DENSITY_KEY = 'entaris.table-density';

function read(key: string): TableDensity {
  try {
    return window.localStorage.getItem(key) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

/**
 * Row density for DataTable, remembered per browser (one global preference
 * unless a page passes its own key). Storage failures fall back silently.
 */
export function useTableDensity(key: string = TABLE_DENSITY_KEY): [TableDensity, (next: TableDensity) => void] {
  const [density, setDensityState] = useState<TableDensity>(() => read(key));
  const setDensity = useCallback(
    (next: TableDensity) => {
      setDensityState(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* storage unavailable: keep the in-memory value */
      }
    },
    [key],
  );
  return [density, setDensity];
}
