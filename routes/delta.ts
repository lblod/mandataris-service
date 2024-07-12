import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { Changeset, Quad } from '../types';
import { processMandatarisForDecisions } from '../controllers/mandatees-decisions';
import { ProcessingQueue } from '../services/processing-queue';

const deltaRouter = Router();
export const mandatarisQueue = new ProcessingQueue();

deltaRouter.post('/decisions', async (req: Request, res: Response) => {
  console.log('|>Triggered the decisions endpoint!');
  const changesets: Changeset[] = req.body;
  const insertTriples = changesets
    .map((changeset: Changeset) => changeset.inserts)
    .flat();

  const mandatarisSubjects = Array.from(
    new Set(insertTriples.map((quad: Quad) => quad.object)),
  );

  mandatarisQueue.setMethodToExecute(processMandatarisForDecisions);
  mandatarisQueue.moveManualQueueToQueue();
  mandatarisQueue.addToQueue(mandatarisSubjects);

  return res.status(200).send({ status: 'ok' });
});

export { deltaRouter };
