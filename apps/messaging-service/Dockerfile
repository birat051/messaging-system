# Build from repository root:
#   docker build -f apps/messaging-service/Dockerfile .
FROM node:22-alpine AS builder
WORKDIR /app
COPY apps/messaging-service/package.json apps/messaging-service/package-lock.json ./
RUN apk add --no-cache python3 make g++ \
  && npm ci \
  && apk del python3 make g++
COPY apps/messaging-service/ ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY apps/messaging-service/package.json apps/messaging-service/package-lock.json ./
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev && npm cache clean --force \
  && apk del python3 make g++
COPY --from=builder /app/dist ./dist
COPY docs/openapi/openapi.yaml /app/openapi/openapi.yaml
ENV OPENAPI_SPEC_PATH=/app/openapi/openapi.yaml
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
