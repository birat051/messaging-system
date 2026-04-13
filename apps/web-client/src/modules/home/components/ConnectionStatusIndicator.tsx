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
      className="text-muted flex items-center gap-2 px-0.5 text-xs"
      title={presenceLabel(status)}
    >
      <span
        data-testid="connection-status-dot"
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${connectionStatusIndicatorDotClass(status)}`}
      />
      <span>{connectionStatusIndicatorLabel(status)}</span>
    </div>
  );
}
