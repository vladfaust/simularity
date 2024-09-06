# Simularity Web Client

This is considered a temporal landing page until the main web client is developed.

## Deployment

Initial setup:

```sh
dokku apps:create simularity-web

# Need to repeat this step for all the build-time variables:
dokku docker-options:add simularity-web build '--build-arg VITE_API_BASE_URL=https://api.simularity.ai'

dokku docker-options:add simularity-web build '--target web'
```

When added a build-time variable:

1. Update the `Dockerfile` (`ARG VAR`);
2. Set `dokku docker-options:add simularity-web build '--build-arg VAR=<VALUE>'`.
3. Rebuild the app: `dokku ps:rebuild simularity-web`.

When changed an existing build-time variable, disable cache and rebuild:

```sh
dokku config:set --no-restart simularity-web DOKKU_DOCKERFILE_CACHE_BUILD=false
dokku ps:rebuild simularity-web
dokku config:set --no-restart simularity-web DOKKU_DOCKERFILE_CACHE_BUILD=true
```
