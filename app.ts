import { app } from 'mu';

import express, { Request, ErrorRequestHandler } from 'express';
import bodyParser from 'body-parser';

import { deltaRouter } from './routes/delta';
import { mandatarissenRouter } from './routes/mandatarissen';
import { fractiesRouter } from './routes/fractie';
import { personenRouter } from './routes/persoon';
import { burgemeesterRouter } from './routes/burgemeester-benoeming';
import { installatievergaderingRouter } from './routes/intallatievergadering';
import { mandatenRouter } from './routes/mandaten';

import { cronjob as notificationBekrachtigdMandataris } from './cron/notification-for-bekrachtigde-mandataris';

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

app.use('/delta', deltaRouter);
app.use('/mandatarissen', mandatarissenRouter);
app.use('/fracties', fractiesRouter);
app.use('/personen', personenRouter);
app.use('/mandaten', mandatenRouter);
app.use('/burgemeester-benoeming', burgemeesterRouter);
app.use('/installatievergadering-api', installatievergaderingRouter);

const errorHandler: ErrorRequestHandler = function (err, _req, res, _next) {
  // custom error handler to have a default 500 error code instead of 400 as in the template
  res.status(err.status || 500);
  res.json({
    errors: [{ title: err.message, description: err.description?.join('\n') }],
  });
};

app.use(errorHandler);

setTimeout(() => notificationBekrachtigdMandataris.start(), 10000);
