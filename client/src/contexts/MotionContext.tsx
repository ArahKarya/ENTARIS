import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  MOTION_STORAGE_KEY,
  REDUCED_MOTION_QUERY,
  isMotionLevel,
  resolveMotion,
  type MotionLevel,
} from '@/lib/motion';
import { MotionContext } from './motion-context';

function readStoredMotion(): MotionLevel | null {
  try {
    const raw = window.localStorage.getItem(MOTION_STORAGE_KEY);
    return isMotionLevel(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredMotion(level: MotionLevel): void {
  try {
    window.localStorage.setItem(MOTION_STORAGE_KEY, level);
  } catch {
    /* storage blocked (private mode): preference lasts for this session only */
  }
}

function getSystemReduced(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

function subscribeSystemReduced(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<MotionLevel | null>(readStoredMotion);
  const systemReduced = useSyncExternalStore(subscribeSystemReduced, getSystemReduced, () => false);
  const motion = resolveMotion(stored, systemReduced);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  const setMotion = useCallback((level: MotionLevel) => {
    writeStoredMotion(level);
    setStored(level);
  }, []);

  const value = useMemo(
    () => ({ motion, followsDevice: stored === null, systemReduced, setMotion }),
    [motion, stored, systemReduced, setMotion],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
