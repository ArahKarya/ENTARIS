import { createContext, useContext } from 'react';
import type { MotionLevel } from '@/lib/motion';

export interface MotionContextType {
  /** Level in effect. */
  motion: MotionLevel;
  /** True while no choice is stored and the level follows the device. */
  followsDevice: boolean;
  /** Device asks for reduced motion. */
  systemReduced: boolean;
  setMotion: (level: MotionLevel) => void;
}

export const MotionContext = createContext<MotionContextType | undefined>(undefined);

const FALLBACK: MotionContextType = {
  motion: 'smooth',
  followsDevice: true,
  systemReduced: false,
  setMotion: () => {},
};

/** Outside the provider (isolated component tests) the default level applies. */
export function useMotion(): MotionContextType {
  return useContext(MotionContext) ?? FALLBACK;
}

/** Recharts `isAnimationActive`: charts animate only at the 'lively' level. */
export function useChartAnimation(): boolean {
  return useMotion().motion === 'lively';
}
