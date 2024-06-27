import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { Changeset } from '../util/types';
import { handleDeltaChangeset } from '../controllers/mandatees-decisions';

const mandateesDecisionsRouter = Router();

mandateesDecisionsRouter.post('/', async (req: Request, res: Response) => {
  const changeSets: Changeset[] = req.body;
  await handleDeltaChangeset(changeSets);

  return res.status(200).send({ status: 'ok' });
});

export { mandateesDecisionsRouter };
