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
const todo = new ProcessingQueue();

mandateesDecisionsRouter.post('/', async (req: Request, res: Response) => {
  const changesets: Changeset[] = req.body;
  const insertTriples = changesets
    .map((changeset: Changeset) => changeset.inserts)
    .flat();
  const mandatarisSubjects = await getSubjectsOfType(
    TERM_MANDATARIS_TYPE,
    insertTriples,
  );
  todo.setMethodToExecute(handleTriplesForMandatarisSubjects);
  todo.addToQueue(mandatarisSubjects);

  return res.status(200).send({ status: 'ok' });
});

export { mandateesDecisionsRouter };
