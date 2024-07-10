import Router from 'express-promise-router';

import { Request, Response } from 'express';


import { Changeset, Quad } from '../types';
import { handleTriplesForMandatarisSubject } from '../controllers/mandatees-decisions';
import { ProcessingQueue } from '../services/processing-queue';

const deltaRouter = Router();
export const mandatarisQueue = new ProcessingQueue();

deltaRouter.post('/decisions', async (req: Request, res: Response) => {
  return res.status(200).send({ status: 'ok' });
});

deltaRouter.post('/mandatees', async (req: Request, res: Response) => {
  console.log('|> Trigger endpoint mandatees-decisions');
  const changesets: Changeset[] = req.body;
  const insertTriples = changesets
    .map((changeset: Changeset) => changeset.inserts)
    .flat();
  const incomingSubjects = Array.from(
    new Set(insertTriples.map((quad: Quad) => quad.subject)),
  );

  mandatarisQueue.setMethodToExecute(handleTriplesForMandatarisSubject);
  mandatarisQueue.moveManualQueueToQueue();
  mandatarisQueue.addToQueue(incomingSubjects);

  return res.status(200).send({ status: 'ok' });
});

export { deltaRouter };
