import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import type { Env } from '../config/env.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * OpenAPI YAML lives in the repo at `docs/openapi/openapi.yaml`. From compiled `dist/`
 * or `src/` (tsx), three levels up reaches the monorepo root.
 */
function defaultSpecPath(): string {
  return join(__dirname, '../../../docs/openapi/openapi.yaml');
}

function loadSpec(env: Env): Record<string, unknown> | null {
  const path = env.OPENAPI_SPEC_PATH ?? defaultSpecPath();
  try {
    const raw = readFileSync(path, 'utf8');
    return parseYaml(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    logger.warn(
      { err, path },
      'Could not load OpenAPI spec; Swagger UI will not be mounted',
    );
    return null;
  }
}

/**
 * Handlers for `app.use('/api-docs', ...handlers)` — includes static assets + HTML.
 * Returns `null` if the spec file could not be read.
 */
export function createSwaggerUiHandlers(env: Env): RequestHandler[] | null {
  const spec = loadSpec(env);
  if (!spec) {
    return null;
  }
  return [
    ...swaggerUi.serve,
    swaggerUi.setup(spec, { customSiteTitle: 'Ekko API' }),
  ];
}
