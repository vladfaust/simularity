# Simularity API Server

NodeJS-based API server for Simularity, providing a REST-based API for the [client](../client/README.md).

## Technology Stack

- NodeJS
- TypeScript
- ExpressJS
- Drizzle
- Valibot

## Deployment

### Dokku

```sh
dokku apps:create simularity-api

dokku postgres:create simularity
dokku postgres:link simularity simularity-api

dokku redis:create simularity
dokku redis:link simularity simularity-api

dokku docker-options:add simularity-api build '--target api'
dokku ps:set simularity-api procfile-path packages/api/Procfile

dokku nginx:set simularity-api client-max-body-size 10m
```
