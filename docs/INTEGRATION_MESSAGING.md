# Messaging integration checks (messaging-service)

## Automated (single process)

With **MongoDB**, **Redis**, and **RabbitMQ** running (for example `docker compose -f infra/docker-compose.yml up -d mongo redis rabbitmq` from the repo root, using the default RabbitMQ user/password expected by local dev):

```bash
cd apps/messaging-service
MESSAGING_INTEGRATION=1 npm run test:integration
```

The test creates users **A** and **B**, connects **B** with Socket.IO (handshake `auth.userId` in non-production), calls **`sendMessageForUser`** (same persistence + RabbitMQ path as **`POST /v1/messages`**), and asserts:

- **B** receives **`message:new`** with the persisted message shape.
- **`publishMessage`** is invoked **once** with routing key **`message.user.<B>`** (recipient fan-out) and **once** with **`message.user.<A>`** (sender multi-device echo per `TASK_CHECKLIST.md`).

Default **`npm test`** does **not** run this file (see `vitest.config.ts` / `vitest.integration.config.ts`).

## Manual — two replicas (A on node-1, B on node-2)

Goal: show that **in-memory** Socket.IO rooms are **not** shared across processes; **RabbitMQ** delivers the event to **each** replica so the replica where **B** is connected can **`io.to('user:<B>').emit('message:new', …)`**.

1. **Topology**  
   Run **two** messaging-service instances with **distinct** **`MESSAGING_INSTANCE_ID`** values (each gets its own RabbitMQ queue; both bind to `message.#`).  
   Point **both** at the **same** MongoDB, Redis, and RabbitMQ.

2. **Routing**  
   Put **nginx** (or another LB) in front with **sticky sessions** disabled for WebSocket upgrade **or** accept that REST and Socket.IO may hit different nodes if you test only Socket.IO paths. For a minimal check, expose **node-1** and **node-2** on different host ports (e.g. `3001`, `3002`) and do **not** use a single hostname for both.

3. **Steps**  
   - Connect client **A** only to **node-1** (`http://node1:port`, JWT or dev `auth.userId`).  
   - Connect client **B** only to **node-2** (`http://node2:port`, `auth.userId` = B).  
   - From **A**, emit **`message:send`** with **`recipientUserId`** = B’s user id.  
   - **Expect:** **B** receives **`message:new`** on node-2 even though **A** never connected to node-2.

4. **Why it works**  
   After persist, the broker publishes **`message.user.<B>`**; **every** instance consumes and runs **`io.to('user:<B>').emit`** locally. Only the instance where **B**’s socket joined **`user:<B>`** actually delivers to a client; others emit into an empty room.

5. **Compose note**  
   The stock **`infra/docker-compose.yml`** defines a **single** `messaging-service` upstream in nginx. To run two app containers you must add a second service (or `docker compose scale`) and **update** `infra/nginx/nginx.conf` with two `server` lines in `upstream messaging_backend` before testing through port **8080**.
