# EAM standalone frontend — pure static SPA build served by nginx.
# Backend/API is the existing Entaris backend container (service app; shared cookie SSO,
# see PRD EAM-Standalone-v0.1). This image has no Node/Express — just the
# built Vite bundle behind nginx.

FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g npm@11
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund --maxsockets=1 --prefer-offline
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3005
