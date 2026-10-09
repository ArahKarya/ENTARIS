import { useState, useEffect } from 'react';

/** Returns `value` debounced by `delay` ms, e.g. so search filtering does not run on every keystroke. */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debounced;
}

export default useDebounce;
