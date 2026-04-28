/**
 * k6 `tags` for HTTP requests — use with **`k6 run --tag run_id=…`**-style output / JSON
 * summary so a load run is filterable. **`run_id`** mirrors **`RUN_ID` / `config.runId`**.
 * @file
 */

/**
 * @param {Record<string, string | number | boolean>} [extra]  e.g. `{ name: 'Health' }`
 * @returns {Record<string, string | number | boolean>}
 */
export function k6HttpTags(extra) {
  return {
    run_id: String(__ENV.RUN_ID || 'k6-local'),
    ...(extra || {}),
  };
}
