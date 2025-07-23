# Mandataris service

Managing Mandataris instances by applying the correct business rules.

## Getting started

### Local development

#### Docker image

1. Build an image from the Dockerfile (e.g. `local-mandataris`)
2. Run the container in development

```bash
docker run --rm -it -p 9228:9229 -p 8082:80 -e NODE_ENV=development local-mandataris
```

3. Running it in development mode and exposing port 9229 allows you to connect your debugger to the docker

#### Debug Compose

Normally this file is not available in a **lblod** service as it is not the preferred way. As it is in this service you can better use it.

When this service is added to a semantic-stack project you can run `docker compose up -d` in the root of this project. So it can connect to your main project. Make sure to update the volume to your `app`.

### Project Structure

- Routing and anything Express related resides in `/routes`. The routes should be simple methods that call services.
- Every that a service or controller will do resides in `/controllers`. This is where the business logic and validations are.
- Queries for the database go in `/data-access`. These query methods should only contain the means to query or mutate the data, and return the result in a format that the service understands.
- Request objects in is not something that we normally do. We added this for the mandataris download as has more query params than usual.
- Everything related to cronjobs can be found in `/cron`.
- Testing the service is done in `contract-tests`.
