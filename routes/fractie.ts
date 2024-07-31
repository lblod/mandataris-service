import { Request, Response } from 'express';
import Router from 'express-promise-router';
import { STATUS_CODE } from '../util/constants';
import { fractieUsecase } from '../controllers/fractie';

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
