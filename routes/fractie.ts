import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { STATUS_CODE } from '../util/constants';
import { fractieUsecase } from '../controllers/fractie';
import { mandatarisUsecase } from '../controllers/mandataris';

export const fractiesRouter = Router();

fractiesRouter.get(
  '/:bestuursperiodeId/bestuursperiode',
  async (req: Request, res: Response) => {
    const id = req.params.bestuursperiodeId;

    try {
      const fractieIds = await fractieUsecase.forBestuursperiode(id);
      return res.status(STATUS_CODE.OK).send({ fracties: fractieIds });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while getting fracties for bestuursperiod: ${id}`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

fractiesRouter.put(
  '/:mandatarisId/current-fractie',
  async (req: Request, res: Response) => {
    const id = req.params.mandatarisId;

    try {
      await mandatarisUsecase.updateCurrentFractie(id);
      return res.status(STATUS_CODE.OK).send();
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while updating the current fractie, starting from mandataris with id: ${id}`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message: message });
    }
  },
);

fractiesRouter.delete(
  '/cleanup/bestuursperiode/:bestuursperiodeId',
  async (req: Request, res: Response) => {
    const bestuursperiodeId = req.params.bestuursperiodeId;

    try {
      const fracties =
        await fractieUsecase.removeFractieWhenNoLidmaatschap(bestuursperiodeId);
      return res.status(STATUS_CODE.OK).send({ fracties });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while cleaning up dangling fracties in bestuursperiode: ${bestuursperiodeId}`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message: message });
    }
  },
);
