import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { mandatarisUsecase } from '../controllers/mandataris';

const mandatarisRouter = Router();

mandatarisRouter.get('/:id/isActive', async (req: Request, res: Response) => {
  const mandatarisId = req.params.id;

  try {
    const isActive = await mandatarisUsecase.isActive(mandatarisId);

    return res.status(200).send({ isActive: isActive ?? false });
  } catch (error) {
    return res.status(error.status ?? 500).send({
      message:
        error.message ??
        'Something went wrong while checking if mandataris is active',
    });
  }
});

export { mandatarisRouter };
