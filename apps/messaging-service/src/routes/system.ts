import { Router } from 'express';
import { getHealth, getReady } from '../controllers/system.js';

/** System routes — **wiring only**. Handlers in **`src/controllers/system.ts`**. */
export const systemRouter = Router();

systemRouter.get('/health', getHealth);
systemRouter.get('/ready', getReady);
