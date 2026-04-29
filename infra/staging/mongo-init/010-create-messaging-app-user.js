/**
 * Runs once when the **`mongo-data`** volume is blank (official **`mongo:7`** **`/docker-entrypoint-initdb.d`** phase).
 * `mongosh` executes this with Node-style **`process.env`** available.
 */

/**
 * @param {string} key
 * @returns {string}
 */
function requireNonEmptyEnv(key) {
  const raw = process.env[key];
  if (raw === undefined || raw === null || typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`${key} must be set (staging .env → mongo service env)`);
  }
  return raw.trim();
}

const dbNameRaw = requireNonEmptyEnv('MONGODB_DB_NAME');

const username = requireNonEmptyEnv('MESSAGING_DB_USER');

const pwd = requireNonEmptyEnv('MESSAGING_DB_PASSWORD');

const target = db.getSiblingDB(dbNameRaw);

try {
  target.createUser({
    user: username,
    pwd,
    roles: [{ role: 'readWrite', db: dbNameRaw }],
  });
  print(
    `[mongo-init] created ${username} readWrite on ${dbNameRaw} (authSource=${dbNameRaw})`,
  );
} catch (e) {
  const msg =
    e && typeof e === 'object' && 'message' in e
      ? String((/** @type {{ message: unknown }} */ (e)).message)
      : String(e);
  if (/already exists/i.test(msg)) {
    print(
      `[mongo-init] user ${username}@${dbNameRaw} already present — skipping (${msg})`,
    );
  } else {
    throw e;
  }
}
