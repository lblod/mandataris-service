import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { codelijstUsecase } from '../controllers/codelijst';

export const codelijstRouter = Router();

codelijstRouter.get(
  '/concept/:id/has-implementation',
  async (req: Request, res: Response) => {
    const hasImplementation = await codelijstUsecase.conceptHasImplementation(
      req.params.id,
    );
    return res.send(!!hasImplementation);
  },
);
