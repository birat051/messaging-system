import { selectIsPeerOnline } from '@/modules/app/stores/presenceSelectors';
import { useAppSelector } from '@/store/hooks';

/**
 * **Online heuristic (Feature 6):** **`true`** when **`presence.byUserId`** has **`ok` + `source: 'redis'`** for this user.
 */
export function useIsPeerOnline(
  userId: string | null | undefined,
): boolean {
  return useAppSelector((s) => selectIsPeerOnline(s, userId));
}
