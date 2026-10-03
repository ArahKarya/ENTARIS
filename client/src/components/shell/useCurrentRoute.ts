import { useLocation } from 'react-router-dom';
import { matchRoute, type RouteEntry } from '@/app/routes';

/** Registry entry for the current URL (label, section, icon …), or undefined. */
export function useCurrentRoute(): RouteEntry | undefined {
  return matchRoute(useLocation().pathname);
}
