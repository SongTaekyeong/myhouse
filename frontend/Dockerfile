# 운영용 이미지. next.config.ts의 output: "standalone" 덕분에 런타임 스테이지가
# node_modules 전체가 아니라 실제 쓰이는 파일만 담아 가볍다.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* 는 런타임이 아니라 빌드 시점에 클라이언트 번들에 박힌다 - 반드시 build-arg로 넘길 것.
ARG NEXT_PUBLIC_KAKAO_JS_KEY
ENV NEXT_PUBLIC_KAKAO_JS_KEY=$NEXT_PUBLIC_KAKAO_JS_KEY
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
