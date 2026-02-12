#!/bin/sh
set -e

dockerd > /var/log/dockerd.log 2>&1 &

until docker info >/dev/null 2>&1; do
  sleep 1
done

apk add --no-cache bash
bash
docker compose up -V  --abort-on-container-exit
