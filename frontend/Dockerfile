# --- Build stage ---
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Vite env vars are baked in at build time, not read at container runtime —
# passed in as build args per environment by the CI workflow.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_API_BASE_URL
ARG VITE_ALLOW_EMAIL_AUTH=false
ARG VITE_BUILD_ID
RUN npm run build

# --- Serve stage ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# The base nginx image's entrypoint auto-processes *.template files here
# with envsubst into /etc/nginx/conf.d/ before starting — no custom CMD
# needed. See https://hub.docker.com/_/nginx "Using environment variables".
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Cloud Run injects PORT (defaults to 8080) and expects the container to
# listen on it.
ENV PORT=8080
EXPOSE 8080
