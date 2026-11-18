import { Request, Response } from 'express';

import { STATUS_CODE } from '../util/constants';
import {
  persoonUsecase,
  putPersonInRightGraph,
  checkFractie,
} from '../controllers/persoon';
import { mandatarisUsecase } from '../controllers/mandataris';
import { fetchUserIdFromSession } from '../data-access/form-queries';
import { mandataris } from '../data-access/mandataris';
import { documentedRouter } from '../util/documented-router';
import { commonErrorResponses, idParameter } from '../util/openapi';

export const personenRouter = documentedRouter();

personenRouter.get(
  '/:id/bestuursperiode/:bestuursperiodeId/current-fractie',
  {
    tags: ['Persons'],
    summary: 'Get the current faction of a person',
    operationId: 'getCurrentFactionOfPerson',
    description:
      'Returns the faction the person is currently associated with in the given legislative period.',
    parameters: [
      idParameter('id', 'UUID of the person.'),
      idParameter('bestuursperiodeId', 'UUID of the legislative period.'),
    ],
    responses: {
      '200': {
        description: 'The current faction of the person, if any.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                fractie: {
                  type: 'string',
                  format: 'uri',
                  nullable: true,
                },
              },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
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
  '/:id/has-active-mandates/:bestuursperiodeId',
  {
    tags: ['Persons'],
    summary: 'Check for active mandates',
    operationId: 'checkActiveMandates',
    description:
      'Indicates whether the person has at least one active mandate in the given legislative period.',
    parameters: [
      idParameter('id', 'UUID of the person.'),
      idParameter('bestuursperiodeId', 'UUID of the legislative period.'),
    ],
    responses: {
      '200': {
        description: 'Whether the person has active mandates.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { isTrue: { type: 'boolean' } },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    try {
      const actieveMandatarissen =
        await mandataris.getActiveMandatarissenForPerson(
          req.params.id,
          req.params.bestuursperiodeId,
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
  {
    tags: ['Persons'],
    summary: 'End all active mandates',
    operationId: 'endActiveMandates',
    description:
      'Ends all active mandatees of a person on a given date, recording a history entry for the action.',
    parameters: [idParameter('id', 'UUID of the person.')],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/EndActiveMandatesRequest',
          },
        },
      },
    },
    schemas: {
      EndActiveMandatesRequest: {
        type: 'object',
        description:
          'Ends all active mandatees of a person on the given date and records a history entry.',
        required: ['bestuursperiodeId', 'date'],
        properties: {
          bestuursperiodeId: {
            type: 'string',
            format: 'uuid',
            description: 'UUID of the legislative period.',
          },
          date: {
            type: 'string',
            format: 'date-time',
            description: 'Date on which the active mandatees end.',
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'The active mandatees were ended.',
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    const personId = req.params.id;
    const { bestuursperiodeId, date } = req.body;

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
        bestuursperiodeId,
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
  '/:persoonId/check-fraction',
  {
    tags: ['Persons'],
    summary: 'Check whether a person belongs to a faction',
    operationId: 'checkPersonBelongsToFaction',
    description:
      'Checks whether the person is a member of the supplied faction in the supplied legislative period.',
    parameters: [idParameter('persoonId', 'UUID of the person.')],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CheckFractionRequest' },
        },
      },
    },
    schemas: {
      CheckFractionRequest: {
        type: 'object',
        description:
          'Checks whether a person is a member of a faction in a legislative period.',
        required: ['bestuursperiodeId', 'fractieId'],
        properties: {
          bestuursperiodeId: {
            type: 'string',
            format: 'uuid',
            description: 'UUID of the legislative period.',
          },
          fractieId: {
            type: 'string',
            format: 'uuid',
            description: 'UUID of the faction to check membership for.',
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Whether the person belongs to the faction.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { ok: { type: 'boolean' } },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    const personId = req.params.persoonId;
    const { bestuursperiodeId, fractieId } = req.body;

    try {
      const fractionIsSame = await checkFractie(
        personId,
        bestuursperiodeId,
        fractieId,
      );
      return res.status(STATUS_CODE.OK).send({ ok: fractionIsSame });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while checking if person with id: ${personId} is in the fraction with id: ${fractieId}`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

personenRouter.post(
  '/:persoonID/put-person-in-right-graph/:orgaanID',
  {
    tags: ['Persons'],
    summary: 'Place a person in the correct graph',
    operationId: 'putPersonInRightGraph',
    description:
      'Copies the data of the person to the graph that owns the given governing body when the person is not yet present there.',
    parameters: [
      idParameter('persoonID', 'UUID of the person.'),
      idParameter(
        'orgaanID',
        'UUID of the governing body that owns the destination graph.',
      ),
    ],
    responses: {
      '200': {
        description: 'The person was placed in the correct graph.',
      },
      ...commonErrorResponses,
    },
  },
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
