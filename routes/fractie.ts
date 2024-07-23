import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { fractieUsecase } from '../controllers/fractie';
import { STATUS_CODE } from '../util/constants';

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

      return res.status(STATUS_CODE.CREATED).send({ uri: createdFractieUri });
    } catch (error) {
      return res
        .status(error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR)
        .send({
          message:
            error.message ??
            'Something went wrong while creating an onafhankelijke fractie.',
        });
    }
  },
);
