import { useContext } from 'react';
import {
  SocketWorkerContext,
  type SocketWorkerContextValue,
} from './socketWorkerContext';

export function useSocketWorker(): SocketWorkerContextValue | null {
  return useContext(SocketWorkerContext);
}
