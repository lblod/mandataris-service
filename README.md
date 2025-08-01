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

This file is available for convenience while developing, it has sane defaults for connecting it to the app-lokaal-mandatenbeheer docker-compose setup where it was conceived. Take note that this depends on your app connecting its database and dispatcher to the debug network as well as to its default network.

### Project Structure

- Routing and anything Express related resides in `/routes`. The routes should be simple methods that call services.
- Every that a service or controller will do resides in `/controllers`. This is where the business logic and validations are.
- Queries for the database go in `/data-access`. These query methods should only contain the means to query or mutate the data, and return the result in a format that the service understands.
- Request objects in is not something that we normally do. We added this for the mandataris download as has more query params than usual.
- Everything related to cronjobs can be found in `/cron`.
- Testing the service is done in `contract-tests`.

## Solutions

The service should help you with the following:

- Creating a history for a Mandataris
- Mandatarissen of a persoon
- Fractie's
- Rangorde of Mandataris
- Linked mandatarissen (OCMW <=> Gemeente)
- Bekrachtiging of mandatarissen
- Installatievergadering
- Burgemeester benoeming
- Importing mandatarissen from a CSV-file
- Repair politie-zone data
- Create notifications for mandataris events

## Development notes

- First line implementation of this service is done in [`Lokaal Mandatenbeheer`](https://github.com/lblod/app-lokaal-mandatenbeheer)
- The route `/mock` is for testing purposes only. We used this for testing the bekrachtiging of a mandataris. The bekrachtiging of a mandataris will in a normal flow go through the cronjob that will intercept the delta's that have a decision.
