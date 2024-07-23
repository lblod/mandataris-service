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

personsRouter.put(
  '/:id/current-fractie/:bestuursperiode',
  async (req: Request, res: Response) => {
    try {
      const personId = req.params.id;
      const bestuursperiodeId = req.params.bestuursperiode;

      const newCurrentFractie = await personUsecase.updateCurrentFractie(
        personId,
        bestuursperiodeId,
      );

      return res.status(STATUS_CODE.OK).send({ current: newCurrentFractie });
    } catch (error) {
      return res
        .status(error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR)
        .send({
          message:
            error.message ??
            `Something went wrong while updating the current fractie on person: ${
              req.params.id ?? undefined
            } in bestuursperiode: ${req.params.bestuursperiode ?? undefined}`,
        });
    }
  },
);
