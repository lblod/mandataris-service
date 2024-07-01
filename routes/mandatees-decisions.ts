import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { Changeset } from '../types';
import { handleDeltaChangeset } from '../controllers/mandatees-decisions';
import { ProcessingQueue } from '../services/processing-queue';

const mandateesDecisionsRouter = Router();
const todo = new ProcessingQueue();

mandateesDecisionsRouter.post('/', async (req: Request, res: Response) => {
  const changeSets: Changeset[] = req.body;
  todo.addToQueue(async () => await handleDeltaChangeset(changeSets));

  return res.status(200).send({ status: 'ok' });
});

export { mandateesDecisionsRouter };
