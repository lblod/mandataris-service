import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { STATUS_CODE } from '../util/constants';
import { persoonUsecase, putPersonInRightGraph } from '../controllers/persoon';
import { mandatarisUsecase } from '../controllers/mandataris';
import { fetchUserIdFromSession } from '../data-access/form-queries';
import { mandataris } from '../data-access/mandataris';

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
  '/:id/has-active-mandates',
  async (req: Request, res: Response) => {
    const { bestuursPeriod } = req.body;
    try {
      const actieveMandatarissen =
        await mandataris.getActiveMandatarissenForPerson(
          req.params.id,
          bestuursPeriod,
        );

      return res
        .status(STATUS_CODE.OK)
        .send({ isTrue: actieveMandatarissen.length > 0 });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while checking if person with id: ${req.params.id} has active mandates.`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

personenRouter.put(
  '/:id/end-active-mandates',
  async (req: Request, res: Response) => {
    const personId = req.params.id;
    const { bestuursPeriod, date } = req.body;

    try {
      const userId = await fetchUserIdFromSession(req.get('mu-session-id'));
      if (!userId) {
        return res
          .status(STATUS_CODE.FORBIDDEN)
          .send({ message: 'Not authenticated' });
      }
      await mandatarisUsecase.setEndDateOfActiveMandatarissen(
        userId,
        personId,
        date,
        bestuursPeriod,
      );

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

personenRouter.post(
  '/:persoonID/put-person-in-right-graph/:orgaanID',
  async (req: Request, res: Response) => {
    const personId = req.params.persoonID;
    const orgaanId = req.params.orgaanID;

    try {
      await putPersonInRightGraph(personId, orgaanId);
      return res.status(STATUS_CODE.OK).send({});
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while checking if the person with id ${personId} needs to be written to another graph as well.`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);
