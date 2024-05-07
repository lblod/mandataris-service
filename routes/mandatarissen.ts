import { Request, Response } from 'express';
import Router from 'express-promise-router';
import { deleteMandataris } from '../data-access/delete';

const mandatarissenRouter = Router();

mandatarissenRouter.delete('/:id', async (req: Request, res: Response) => {
  await deleteMandataris(req.params.id);
  return res.status(204).send();
});

export { mandatarissenRouter };
