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

personenRouter.put(
  '/:id/end-active-mandates',
  async (req: Request, res: Response) => {
    const personId = req.params.id;

    try {
      await persoonUsecase.setEndDateOfActiveMandatarissen(personId);
      return res.status(STATUS_CODE.OK).send({});
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while setting the end dates of active mandatarissen for person with id: ${personId} to today.`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);
