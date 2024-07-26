import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { personUsecase } from '../controllers/persoon';
import { STATUS_CODE } from '../util/constants';

export const personsRouter = Router();

personsRouter.get(
  '/:id/onafhankelijke-fractie',
  async (req: Request, res: Response) => {
    try {
      const personId = req.params.id;
      const onafhankelijkerFactie =
        await personUsecase.findOnfhankelijkeFractieUri(personId);

      return res
        .status(STATUS_CODE.OK)
        .send({ fractie: onafhankelijkerFactie });
    } catch (error) {
      return res
        .status(error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR)
        .send({
          message:
            error.message ??
            `Something went wrong while finding the onafhankelijke fractie for person: ${
              req.params.id ?? undefined
            }`,
        });
    }
  },
);
