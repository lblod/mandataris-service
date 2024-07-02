import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { Changeset } from '../types';
import { handleTriplesForMandatarisSubjects } from '../controllers/mandatees-decisions';
import { ProcessingQueue } from '../services/processing-queue';
import {
  getSubjectsOfType,
  TERM_MANDATARIS_TYPE,
} from '../data-access/mandatees-decisions';

const mandateesDecisionsRouter = Router();
export const mandatarisQueue = new ProcessingQueue();

mandateesDecisionsRouter.post('/', async (req: Request, res: Response) => {
  const changesets: Changeset[] = req.body;
  const insertTriples = changesets
    .map((changeset: Changeset) => changeset.inserts)
    .flat();
  const mandatarisSubjects = await getSubjectsOfType(
    TERM_MANDATARIS_TYPE,
    insertTriples,
  );
  console.log('|> Triggered by Delta');
  mandatarisQueue.setMethodToExecute(handleTriplesForMandatarisSubjects);
  mandatarisQueue.addToQueue(mandatarisSubjects);
  mandatarisQueue.moveManualQueueToQueue();

  return res.status(200).send({ status: 'ok' });
});

export { mandateesDecisionsRouter };
