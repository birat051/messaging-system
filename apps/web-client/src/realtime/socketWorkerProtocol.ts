/** Messages from the socket Web Worker → main thread */
export type WorkerToMainMessage =
  | { type: 'connected'; socketId?: string }
  | { type: 'disconnected'; reason: string }
  | { type: 'connect_error'; message: string }
  | { type: 'notification'; payload: unknown };

/** Main thread → worker */
export type MainToWorkerMessage =
  | { type: 'connect'; url: string; userId: string }
  | { type: 'disconnect' };
