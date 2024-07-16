import { Request, Response } from 'express';
import Router from 'express-promise-router';
import { getNbActiveEffectiveMandatarissen } from '../data-access/mandaat';

const mandatenRouter = Router();

mandatenRouter.get(
  '/nbMembers/:mandaatID',
  async (req: Request, res: Response) => {
    const nb = await getNbActiveEffectiveMandatarissen(req.params.mandaatID);
    return res.send({ count: nb });
  },
);

export { mandatenRouter };
