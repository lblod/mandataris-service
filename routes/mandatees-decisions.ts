import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { Changeset, Quad } from '../types';
import { handleTriplesForMandatarisSubject } from '../controllers/mandatees-decisions';
import { ProcessingQueue } from '../services/processing-queue';

const mandateesDecisionsRouter = Router();
export const mandatarisQueue = new ProcessingQueue();

mandateesDecisionsRouter.post('/', async (req: Request, res: Response) => {
  console.log('|> Trigger endpoint mandatees-decisions');
  const changesets: Changeset[] = req.body;
  const insertTriples = changesets
    .map((changeset: Changeset) => changeset.inserts)
    .flat();
  const incomingSubjects = Array.from(
    new Set(insertTriples.map((quad: Quad) => quad.subject)),
  );
  console.log('|> CURRENT QUEUE ITEMS', mandatarisQueue.queue.length);
  mandatarisQueue.setMethodToExecute(handleTriplesForMandatarisSubject);
  mandatarisQueue.addToQueue(incomingSubjects);
  mandatarisQueue.moveManualQueueToQueue();

  return res.status(200).send({ status: 'ok' });
});

export { mandateesDecisionsRouter };
