import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { getActivePersonen } from '../data-access/orgaan';

const organenRouter = Router();

organenRouter.get(
  '/:orgaanId/activeMembers',
  async (req: Request, res: Response) => {
    const count = await getActivePersonen(req.params.orgaanId);
    return res.send({ count });
  },
);

export { organenRouter };
