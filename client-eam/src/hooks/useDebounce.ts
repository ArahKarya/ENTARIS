import { useState, useEffect } from 'react';

/**
 * Returns `value` debounced by `delay` ms. Useful for search inputs so the
 * filtering work doesn't re-run on every keystroke.
 *
 * Usage:
 *   const debouncedSearch = useDebounce(searchTerm, 200);
 *   const filtered = useMemo(() => list.filter(...), [list, debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debounced;
}

export default useDebounce;
