import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { STATUS_CODE } from '../util/constants';
import { persoonUsecase } from '../controllers/persoon';

export const personenRouter = Router();

personenRouter.get(
  '/:id/bestuursperiode/:bestuursperiodeId/current-fractie',
  async (req: Request, res: Response) => {
    const personId = req.params.id;
    const bestuursperiodeId = req.params.bestuursperiodeId;

    try {
      const fractieUri = await persoonUsecase.getFractie(
        personId,
        bestuursperiodeId,
      );
      return res.status(STATUS_CODE.OK).send({ fractie: fractieUri });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while getting current fractie in bestuursperiode: ${bestuursperiodeId} for person with id: ${personId}`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);
personenRouter.get(
  '/:id/bestuursperiode/:bestuursperiodeId/fracties',
  async (req: Request, res: Response) => {
    const personId = req.params.id;
    const bestuursperiodeId = req.params.bestuursperiodeId;

    try {
      const fractieIds = await persoonUsecase.getMandatarisFracties(
        personId,
        bestuursperiodeId,
      );
      return res.status(STATUS_CODE.OK).send({ fracties: fractieIds });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while getting all fracties in bestuursperiode: ${bestuursperiodeId} for person with id: ${personId}`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);
