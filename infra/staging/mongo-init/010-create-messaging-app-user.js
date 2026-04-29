/**
 * Runs once when the **`mongo-data`** volume is blank (official **`mongo:7`** **`/docker-entrypoint-initdb.d`** phase).
 * `mongosh` executes this with Node-style **`process.env`** available.
 */

const dbNameRaw = (process.env.MONGODB_DB_NAME || 'messaging').trim();

const username = (process.env.MESSAGING_DB_USER || 'messaging_app').trim();

const pwd = process.env.MESSAGING_DB_PASSWORD;
if (
  pwd === undefined ||
  pwd === null ||
  typeof pwd !== 'string' ||
  pwd.trim().length === 0
) {
  throw new Error(
    'MESSAGING_DB_PASSWORD must be set (staging .env → mongo service env)',
  );
}

const target = db.getSiblingDB(dbNameRaw);

try {
  target.createUser({
    user: username,
    pwd: pwd.trim(),
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
