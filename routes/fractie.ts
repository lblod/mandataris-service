import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { fractieUsecase } from '../controllers/fractie';

export const fractiesRouter = Router();

fractiesRouter.post(
  '/onafhankelijke-fractie',
  async (req: Request, res: Response) => {
    try {
      const jsonBody = req.body;
      const createdFractieUri = await fractieUsecase.create(
        jsonBody.bestuursorgaanUrisInTijd,
        jsonBody.bestuurseenheidUri,
      );

      return res.status(201).send({ uri: createdFractieUri });
    } catch (error) {
      return res.status(error.status ?? 500).send({
        message:
          error.message ??
          'Something went wrong while creating an onafhankelijke fractie.',
      });
    }
  },
);
