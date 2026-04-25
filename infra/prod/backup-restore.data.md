# Data plane backup / restore (`infra/prod/docker-compose.data.yml`)

Named volumes: **`mongo-data`**, **`minio-data`**. **Redis** in this file has no volume — treat as **ephemeral** (sessions/cache); snapshot only if you add persistence later.

## Find volume names on the host

```bash
docker volume ls | grep -E 'mongo-data|minio-data'
# Often: `<project>_mongo-data` — project = directory name or `COMPOSE_PROJECT_NAME`.
```

## MongoDB (`mongo-data`)

**Backup (logical dump, while stack is up, no auth — default in `infra/prod/docker-compose.data.yml`):**

```bash
docker compose -f infra/prod/docker-compose.data.yml exec -T mongo \
  mongodump --archive --gzip > "mongo-$(date -u +%Y%m%d).archive.gz"
```

(If you add MongoDB auth, add `--username` / `--password` / `--authenticationDatabase` to both dump and restore.)  
**Restore:** with Mongo running and (for full replace) a clean or new data dir, pipe or copy the archive in and:  
`mongorestore --archive --gzip --nsInclude='...'` (or full restore) — see [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/).

**Filesystem copy (host has Docker access to volumes):** stop the `mongo` container, copy the volume mount point or use a one-off `busybox` container with `-v mongo-data:/data:ro` and `tar` the tree.

## MinIO (`minio-data`)

**Backup:** use [MinIO Client](https://min.io/docs/minio/linux/reference/minio-mc.html) `mc mirror` to a second bucket or disk; or **stop** `minio` and `docker run` + `tar` the volume, or your provider’s volume snapshot (EBS, etc.).

**Restore:** `mc mirror` back, or replace the volume with a `tar` extract while `minio` is stopped.

## Redis

Not backed up in this stack. If you need durable Redis, add a `redis-data` volume + `appendonly yes` in a custom config (separate change).
