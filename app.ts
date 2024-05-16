import { app } from 'mu';
import { mandatarissenRouter } from './routes/mandatarissen';
import express, { ErrorRequestHandler } from 'express';
import { burgemeesterRouter } from './routes/burgemeester-benoeming';

app.use(express.urlencoded({ extended: true }));

app.get('/', async (_req, res) => {
  res.send({ status: 'ok' });
});

app.use('/mandatarissen', mandatarissenRouter);
app.use('/burgemeester-benoeming', burgemeesterRouter);

const errorHandler: ErrorRequestHandler = function (err, _req, res, _next) {
  // custom error handler to have a default 500 error code instead of 400 as in the template
  res.status(err.status || 500);
  res.json({
    errors: [{ title: err.message }],
  });
};

app.use(errorHandler);
