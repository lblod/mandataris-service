import { Request, Response } from 'express';
import Router from 'express-promise-router';
import { getNbActiveMandatarissen } from '../data-access/mandaat';

const mandatenRouter = Router();

mandatenRouter.get(
  '/nbMembers/:mandaatID',
  async (req: Request, res: Response) => {
    const nb = await getNbActiveMandatarissen(req.params.mandaatID);
    return res.send({ count: nb });
  },
);

export { mandatenRouter };
