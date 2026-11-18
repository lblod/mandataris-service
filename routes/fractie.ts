import { Request, Response } from 'express';

import { STATUS_CODE } from '../util/constants';
import { fractieUsecase } from '../controllers/fractie';
import { mandatarisUsecase } from '../controllers/mandataris';
import { deleteInstanceWithTombstone } from '../data-access/delete';
import { documentedRouter } from '../util/documented-router';
import { commonErrorResponses, idParameter } from '../util/openapi';

export const fractiesRouter = documentedRouter();

fractiesRouter.delete(
  '/:id',
  {
    tags: ['Factions'],
    summary: 'Delete a faction',
    operationId: 'deleteFaction',
    description: 'Deletes a faction by replacing it with a tombstone.',
    parameters: [idParameter('id', 'UUID of the faction to delete.')],
    responses: {
      '204': {
        description: 'The faction was deleted.',
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    await deleteInstanceWithTombstone(req.params.id);
    return res.status(204).send();
  },
);

fractiesRouter.get(
  '/onafhankelijk/:bestuursperiodeId/bestuursperiode',
  {
    tags: ['Factions'],
    summary: 'List independent factions',
    operationId: 'listIndependentFactions',
    description: 'Returns the independent factions for a legislative period.',
    parameters: [
      idParameter('bestuursperiodeId', 'UUID of the legislative period.'),
    ],
    responses: {
      '200': {
        description: 'The independent factions for the period.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                fracties: {
                  type: 'array',
                  items: { type: 'string', format: 'uuid' },
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
    const id = req.params.bestuursperiodeId;

    try {
      const fractieIds = await fractieUsecase.forBestuursperiode(id, true);
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

fractiesRouter.get(
  '/samenwerking/:bestuursperiodeId/bestuursperiode',
  {
    tags: ['Factions'],
    summary: 'List cooperation factions',
    operationId: 'listCooperationFactions',
    description: 'Returns the cooperation factions for a legislative period.',
    parameters: [
      idParameter('bestuursperiodeId', 'UUID of the legislative period.'),
    ],
    responses: {
      '200': {
        description: 'The cooperation factions for the period.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                fracties: {
                  type: 'array',
                  items: { type: 'string', format: 'uuid' },
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
    const id = req.params.bestuursperiodeId;

    try {
      const fractieIds = await fractieUsecase.forBestuursperiode(id, false);
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

fractiesRouter.post(
  '/:mandatarisId/current-fractie',
  {
    tags: ['Factions'],
    summary: 'Update the current faction of a mandatee',
    operationId: 'updateCurrentFactionOfMandatee',
    description:
      'Synchronises the current faction on the person with the faction of the most recent membership of the mandatee.',
    parameters: [idParameter('mandatarisId', 'UUID of the mandatee.')],
    responses: {
      '200': {
        description: 'The current faction was synchronised.',
      },
      ...commonErrorResponses,
    },
  },
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
  {
    tags: ['Factions'],
    summary: 'Clean up empty factions',
    operationId: 'cleanupEmptyFactions',
    description:
      'Removes factions in a legislative period that no longer have any memberships.',
    parameters: [
      idParameter('bestuursperiodeId', 'UUID of the legislative period.'),
    ],
    responses: {
      '200': {
        description: 'The empty factions were removed.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                fracties: {
                  type: 'array',
                  items: { type: 'string', format: 'uuid' },
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

fractiesRouter.post(
  '/:fractieId/create-replacement',
  {
    tags: ['Factions'],
    summary: 'Create a faction replacement',
    operationId: 'createFactionReplacement',
    description:
      'Ends the current faction on a given date and creates a replacement with a new label. The body contains `label` and `endDate`.',
    parameters: [idParameter('fractieId', 'UUID of the faction to replace.')],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/CreateFractieReplacementRequest',
          },
        },
      },
    },
    schemas: {
      CreateFractieReplacementRequest: {
        type: 'object',
        description:
          'Ends the current faction on the given date and creates a replacement with a new label.',
        required: ['label', 'endDate'],
        properties: {
          label: {
            type: 'string',
            description: 'Label of the replacement faction.',
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'Date on which the current faction ends.',
          },
        },
      },
    },
    responses: {
      '201': {
        description: 'The replacement faction was created.',
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    const currentFractieId = req.params.fractieId;

    try {
      await fractieUsecase.createReplacement(
        currentFractieId,
        req.body.label,
        req.body.endDate,
      );
      return res.status(STATUS_CODE.CREATED).send();
    } catch (error) {
      const message =
        error.message ??
        `Er liep iets mis bij het hernoemen van de huidige fractie met id: ${currentFractieId}`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message: message });
    }
  },
);
