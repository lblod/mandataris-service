import { app } from 'mu';
import { Request, Response, ErrorRequestHandler } from 'express';
import { deleteMandataris } from './services/delete';

app.get('/', async (_req, res) => {
  res.send({ status: 'ok' });
});

app.delete('/mandatarissen/:id', async (req: Request, res: Response) => {
  await deleteMandataris(req.params.id);
  res.sendStatus(200);
});

const errorHandler: ErrorRequestHandler = function (err, _req, res, _next) {
  // custom error handler to have a default 500 error code instead of 400 as in the template
  res.status(err.status || 500);
  res.json({
    errors: [{ title: err.message }],
  });
};

app.use(errorHandler);
