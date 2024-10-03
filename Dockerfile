##
# The "api" target.
# Run with `docker run container npm run web`.
##

FROM node:20-buster-slim AS api

COPY \
  ./package.json \
  ./package-lock.json \
  /app/

COPY ./packages/api/db /app/packages/api/db
COPY ./packages/api/src /app/packages/api/src
COPY \
  ./packages/api/package.json \
  ./packages/api/Procfile \
  ./packages/api/tsconfig.json \
  /app/packages/api/

WORKDIR /app
RUN npm install --ci
RUN npm run build --workspace packages/api

WORKDIR /app/packages/api

ENV HOST 0.0.0.0
ENV PORT 5000
EXPOSE 5000

ENTRYPOINT []

##
# The "build-web" target, where the web app is built.
##

FROM node:20-buster-slim AS build-web

COPY \
  ./package.json \
  ./package-lock.json \
  /app/

COPY --from=api /app/packages/api/dist /app/packages/api/dist
COPY --from=api /app/packages/api/package.json /app/packages/api/

COPY ./packages/web/public /app/packages/web/public
COPY ./packages/web/src /app/packages/web/src
COPY \
  ./packages/web/index.html \
  ./packages/web/package.json \
  ./packages/web/postcss.config.cjs \
  ./packages/web/tailwind.config.cjs \
  ./packages/web/tsconfig.app.json \
  ./packages/web/tsconfig.json \
  ./packages/web/tsconfig.node.json \
  ./packages/web/vite.config.ts \
  /app/packages/web/

ARG VITE_API_BASE_URL
ARG VITE_PATREON_CAMPAIGN_URL
ARG VITE_DISCORD_URL
ARG VITE_REDDIT_URL
ARG VITE_TWITTER_URL
ARG VITE_DOWNLOAD_DARWIN_ARM64_URL

WORKDIR /app
RUN npm install --ci
RUN npm run build --workspace packages/web

##
# The "web" target.
##

FROM nginx:1.25.1-alpine AS web

COPY --from=build-web /app/packages/web/dist /usr/share/nginx/html
COPY ./packages/web/nginx.conf /etc/nginx/
