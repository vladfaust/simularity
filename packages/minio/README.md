# Minio

Running on Dokku.

## Deploy

```bash
dokku config:set --no-restart minio MINIO_ROOT_USER=$(echo `openssl rand -base64 45` | tr -d \=+ | cut -c 1-20)
dokku config:set --no-restart minio MINIO_ROOT_PASSWORD=$(echo `openssl rand -base64 45` | tr -d \=+ | cut -c 1-32)
dokku config:set --no-restart minio MINIO_DOMAIN=minio.example.com

mkdir -p /var/lib/dokku/data/storage/minio
chown 32769:32769 /var/lib/dokku/data/storage/minio
dokku storage:mount minio /var/lib/dokku/data/storage/minio:/var/data

dokku ports:set minio http:80:9001 http:9000:9000
dokku nginx:set minio client-max-body-size 1g
dokku proxy:build-config minio
```
