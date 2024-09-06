FROM node:20-buster-slim AS build-common

WORKDIR /app

COPY \
  ./package.json \
  ./package-lock.json \
  /app/
COPY ./packages/api-sdk/package.json /app/packages/api-sdk/
COPY ./packages/api/package.json /app/packages/api/
COPY ./packages/web/package.json /app/packages/web/
RUN npm install

COPY ./packages/api-sdk /app/packages/api-sdk
RUN npm run build --workspace packages/api-sdk

##
# The "api" target.
# Run with `docker run container npm run web`.
##

FROM node:20-buster-slim AS api

# Copy the artifacts from the build-common stage.
COPY --from=build-common \
  /app/package.json \
  /app/package-lock.json \
  /app/
COPY --from=build-common /app/node_modules /app/node_modules

COPY --from=build-common /app/packages/api-sdk/node_modules /app/packages/api-sdk/node_modules
COPY --from=build-common /app/packages/api-sdk/dist /app/packages/api-sdk/dist
COPY --from=build-common /app/packages/api-sdk/package.json /app/packages/api-sdk/

COPY --from=build-common /app/packages/api/node_modules /app/packages/api/node_modules
COPY --from=build-common /app/packages/api/package.json /app/packages/api/

# Copy API-specific files.
COPY ./packages/api/db /app/packages/api/db
COPY ./packages/api/src /app/packages/api/src
COPY \
  ./packages/api/Procfile \
  ./packages/api/tsconfig.json \
  /app/packages/api/

WORKDIR /app
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

# Copy the artifacts from the build-common stage.
COPY --from=build-common \
  /app/package.json \
  /app/package-lock.json \
  /app/
COPY --from=build-common /app/node_modules /app/node_modules

COPY --from=build-common /app/packages/api-sdk/node_modules /app/packages/api-sdk/node_modules
COPY --from=build-common /app/packages/api-sdk/dist /app/packages/api-sdk/dist
COPY --from=build-common /app/packages/api-sdk/package.json /app/packages/api-sdk/

COPY --from=build-common /app/packages/web/node_modules /app/packages/web/node_modules
COPY --from=build-common /app/packages/web/package.json /app/packages/web/

# Copy web-specific files.
COPY ./packages/web/public /app/packages/web/public
COPY ./packages/web/src /app/packages/web/src
COPY \
  ./packages/web/index.html \
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
ARG VITE_TWITTER_URL
ARG VITE_DOWNLOAD_DARWIN_ARM64_URL

WORKDIR /app
RUN npm run build --workspace packages/web

##
# The "web" target.
##

FROM nginx:1.25.1-alpine AS web

COPY --from=build-web /app/packages/web/dist /usr/share/nginx/html
COPY ./packages/web/nginx.conf /etc/nginx/
