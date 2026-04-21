import { selectConnectionPresenceStatus } from '@/modules/app/stores/connectionSelectors';
import { useAppSelector } from '@/store/hooks';
import {
  connectionStatusIndicatorDotClass,
  connectionStatusIndicatorLabel,
} from '@/common/utils/connectionStatusIndicatorDisplay';
import { presenceLabel } from '@/common/utils/presenceLabel';

/**
 * Live **Socket.IO** connection cue (mirrors **`connection.presenceStatus`** from **`SocketWorkerProvider`**).
 */
export function ConnectionStatusIndicator() {
  const status = useAppSelector(selectConnectionPresenceStatus);

  return (
    <div
      role="status"
      data-testid="connection-status-indicator"
      data-variant={status.kind}
      className="text-muted flex min-h-9 items-center gap-2 px-0.5 text-sm"
      title={presenceLabel(status)}
    >
      <span
        data-testid="connection-status-dot"
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 rounded-full ${connectionStatusIndicatorDotClass(status)}`}
      />
      <span>{connectionStatusIndicatorLabel(status)}</span>
    </div>
  );
}
