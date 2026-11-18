import { app } from 'mu';

import express, { Request, ErrorRequestHandler } from 'express';
import bodyParser from 'body-parser';

import { deltaRouter } from './routes/delta-router';
import { mandatarissenRouter } from './routes/mandatarissen';
import { fractiesRouter } from './routes/fractie';
import { personenRouter } from './routes/persoon';
import { burgemeesterRouter } from './routes/burgemeester-benoeming';
import { installatievergaderingRouter } from './routes/installatievergadering';
import { organenRouter } from './routes/organen';
import { mockRouter } from './routes/mock';
import { electionResultsRouter } from './routes/verkiezingsresultaten';
import { rangordeRouter } from './routes/rangorde';
import { validateUrlRouter } from './routes/validate-url';
import { buildOpenApiDocument } from './openapi';
import type { RouterMount } from './openapi';

import { cronjob as notificationActiveMandateesWithoutBesluitCron } from './cron/notification-for-bekrachtigde-mandataris';
import { cronjob as processHarvestedDecisions } from './cron/auto-bekrachtig-mandatarissen';
import { cronjob as linkingOfMandatees } from './cron/linking-mandatees';

app.use(
  bodyParser.json({
    limit: '500mb',
    type: function (req: Request) {
      return /^application\/json/.test(req.get('content-type') as string);
    },
  }),
);

app.use(express.urlencoded({ extended: true }));

app.get('/', async (_req, res) => {
  res.send({ status: 'ok' });
});

const routerMounts: RouterMount[] = [
  { prefix: '/delta', router: deltaRouter },
  { prefix: '/mandatarissen', router: mandatarissenRouter },
  { prefix: '/fracties', router: fractiesRouter },
  { prefix: '/personen', router: personenRouter },
  { prefix: '/organen', router: organenRouter },
  { prefix: '/burgemeester-benoeming', router: burgemeesterRouter },
  {
    prefix: '/installatievergadering-api',
    router: installatievergaderingRouter,
  },
  { prefix: '/election-results-api', router: electionResultsRouter },
  { prefix: '/rangorde', router: rangordeRouter },
  { prefix: '/mock', router: mockRouter },
  { prefix: '/validate-url', router: validateUrlRouter },
];

const openApiDocument = buildOpenApiDocument(routerMounts);

const swaggerUiPage = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mandataris Service API documentation</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: 'openapi.json',
        dom_id: '#swagger-ui',
      });
    </script>
  </body>
</html>
`;

app.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

app.get('/docs', (_req, res) => {
  res.type('html').send(swaggerUiPage);
});

for (const mount of routerMounts) {
  app.use(mount.prefix, mount.router);
}

const errorHandler: ErrorRequestHandler = function (err, _req, res, _next) {
  // custom error handler to have a default 500 error code instead of 400 as in the template
  res.status(err.status || 500);
  res.json({
    errors: [{ title: err.message, description: err.description?.join('\n') }],
  });
};

app.use(errorHandler);

notificationActiveMandateesWithoutBesluitCron.start();
processHarvestedDecisions.start();
linkingOfMandatees.start();
