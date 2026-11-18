import { Request, Response } from 'express';
import multer from 'multer';

import { mandatarisDownloadRequest } from '../Requests/mandataris-download';

import { deleteMandatarisWithTombstone } from '../data-access/delete';

import {
  changeStateLinkedMandataris,
  checkLinkedMandataris,
  correctMistakesLinkedMandataris,
  createLinkedMandataris,
  removeLinkLinkedMandataris,
} from '../controllers/linked-mandataris';
import {
  handleBulkSetPublicationStatus,
  mandatarisUsecase,
} from '../controllers/mandataris';
import { mandatarisDownloadUsecase } from '../controllers/mandataris-download';
import { uploadCsv } from '../controllers/mandataris-upload';

import { CsvUploadState } from '../types';

import { STATUS_CODE } from '../util/constants';
import { documentedRouter } from '../util/documented-router';
import { HttpError } from '../util/http-error';
import {
  commonErrorResponses,
  idParameter,
  queryParameter,
} from '../util/openapi';

const upload = multer({ dest: 'mandataris-uploads/' });

const mandatarissenRouter = documentedRouter();

mandatarissenRouter.delete(
  '/:id',
  {
    tags: ['Mandatees'],
    summary: 'Delete a mandatee',
    operationId: 'deleteMandatee',
    description:
      'Deletes a mandatee by replacing it with a tombstone. Use `withLinked=true` to also delete the linked mandatee in the other government level.',
    parameters: [
      idParameter('id', 'UUID of the mandatee to delete.'),
      queryParameter(
        'withLinked',
        'Also delete the linked mandatee in the other government level.',
        { type: 'boolean', default: false },
      ),
    ],
    responses: {
      '204': {
        description: 'The mandatee was deleted.',
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    const withLinked = req.query.withLinked === 'true';
    await deleteMandatarisWithTombstone(req.params.id, withLinked);
    return res.status(204).send();
  },
);

mandatarissenRouter.post(
  '/upload-csv',
  {
    tags: ['CSV import'],
    summary: 'Upload a CSV file',
    operationId: 'uploadMandateesCsv',
    description:
      'Imports mandatees from a CSV file for the municipality of the current session. The response reports created persons, mandatees, policy domains, errors, and warnings.',
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file'],
            properties: {
              file: {
                type: 'string',
                format: 'binary',
                description: 'The CSV file containing the mandatees.',
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description:
          'The import result, including created records, errors, and warnings.',
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  upload.single('file'),
  async (req: Request, res: Response) => {
    const state: CsvUploadState & { status?: string } = await uploadCsv(req);
    state.status = state.errors.length > 0 ? 'error' : 'ok';
    res.status(200).send(state);
  },
);

mandatarissenRouter.get(
  '/check-ownership',
  {
    tags: ['Mandatees'],
    summary: 'Check mandatee ownership',
    operationId: 'checkMandateeOwnership',
    description:
      'Checks whether the current session has access to the supplied mandatees. Returns an error when no mandatee IDs are provided.',
    parameters: [
      queryParameter(
        'mandatarisIds',
        'Comma-separated UUIDs of the mandatees to check.',
        { type: 'string' },
        true,
      ),
    ],
    responses: {
      '200': {
        description: 'The ownership information for the supplied mandatees.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    let mandatarisIds = req.query.mandatarisIds;
    if (mandatarisIds?.split) {
      mandatarisIds = mandatarisIds.split(',').filter((id) => id && id !== '');
    }
    if (mandatarisIds.length === 0) {
      throw new HttpError('No mandatarisIds provided', STATUS_CODE.BAD_REQUEST);
    }
    const result =
      await mandatarisUsecase.checkMandatarisOwnership(mandatarisIds);
    res.status(200).send(result);
  },
);

mandatarissenRouter.get(
  '/:id/check-possible-double',
  {
    tags: ['Linked mandatees'],
    summary: 'Check for a possible duplicate mandate',
    operationId: 'checkPossibleDuplicateMandate',
    description:
      'Checks whether the mandatee already has a counterpart in the linked government level and returns any existing link.',
    parameters: [idParameter('id', 'UUID of the mandatee.')],
    responses: {
      '200': {
        description:
          'Information about a possible duplicate and the existing link, if any.',
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    try {
      const result = await checkLinkedMandataris(req);
      return res.status(200).send(result);
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while checking for possible duplicate mandate for: ${req.params.id}. Please try again later.`;
      const statusCode = error.status ?? 500;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.post(
  '/:id/create-linked-mandataris',
  {
    tags: ['Linked mandatees'],
    summary: 'Create a linked mandatee',
    operationId: 'createLinkedMandatee',
    description:
      'Creates the mirrored OCMW or municipal mandatee, including the person, faction, and replacement links.',
    parameters: [idParameter('id', 'UUID of the source mandatee.')],
    responses: {
      '201': {
        description: 'The linked mandatee was created.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    try {
      await createLinkedMandataris(req);
      return res.status(201).send({ status: 'ok' });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while creating duplicate mandate for: ${req.params.id}. Please try again later.`;
      const statusCode = error.status ?? 500;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.post(
  '/:id/correct-linked-mandataris',
  {
    tags: ['Linked mandatees'],
    summary: 'Correct linked mandatee data',
    operationId: 'correctLinkedMandateeData',
    description:
      'Repairs inconsistencies between a mandatee and its linked counterpart, such as faction or person data.',
    parameters: [idParameter('id', 'UUID of the mandatee.')],
    responses: {
      '200': {
        description: 'The linked mandatee was corrected.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    try {
      await correctMistakesLinkedMandataris(req);
      return res.status(200).send({ status: 'ok' });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while creating duplicate mandate for: ${req.params.id}. Please try again later.`;
      const statusCode = error.status ?? 500;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.post(
  '/:oldId/:newId/update-state-linked-mandataris',
  {
    tags: ['Linked mandatees'],
    summary: 'Change the state of a linked mandatee',
    operationId: 'changeLinkedMandateeState',
    description:
      'Updates the linked mandatee when the source mandatee changes state, for example when a replacement starts or ends.',
    parameters: [
      idParameter('oldId', 'UUID of the mandatee in its previous state.'),
      idParameter('newId', 'UUID of the mandatee in its new state.'),
    ],
    responses: {
      '200': {
        description: 'The linked mandatee state was updated.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    try {
      await changeStateLinkedMandataris(req);
      return res.status(200).send({ status: 'ok' });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while changing state of duplicate mandate of: ${req.params.id}. Please try again later.`;
      const statusCode = error.status ?? 500;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.delete(
  '/:id/remove-link-linked-mandataris',
  {
    tags: ['Linked mandatees'],
    summary: 'Remove a link between mandatees',
    operationId: 'removeLinkedMandateeLink',
    description:
      'Removes the link between a mandatee and its counterpart without deleting either mandatee.',
    parameters: [idParameter('id', 'UUID of the mandatee.')],
    responses: {
      '200': {
        description: 'The link was removed.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    try {
      await removeLinkLinkedMandataris(req);
      return res.status(200).send({ status: 'ok' });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while removing link of linked mandates for: ${req.params.id}. Please try again later.`;
      const statusCode = error.status ?? 500;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.post(
  '/bulk-set-publication-status/',
  {
    tags: ['Mandatees'],
    summary: 'Set publication status in bulk',
    operationId: 'bulkSetPublicationStatus',
    description:
      'Sets the publication status of multiple mandatees to ratified or not ratified. Ratifying requires a link to the decision (for example a `besluit` URI).',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/BulkSetPublicationStatusRequest',
          },
        },
      },
    },
    schemas: {
      BulkSetPublicationStatusRequest: {
        type: 'object',
        description:
          'Sets the publication status of multiple mandatees to ratified or not ratified.',
        required: ['statusUri', 'mandatarissen'],
        properties: {
          statusUri: {
            type: 'string',
            format: 'uri',
            description: 'URI of the publication status to apply.',
          },
          decision: {
            type: 'string',
            format: 'uri',
            description:
              'Link to the decision that ratifies the appointments (for example a besluit URI). Required when ratifying.',
          },
          mandatarissen: {
            type: 'array',
            description: 'UUIDs of the mandatees to update.',
            items: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'The publication statuses were updated.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    const { decision, statusUri, mandatarissen } = req.body;

    try {
      await handleBulkSetPublicationStatus(mandatarissen, statusUri, decision);
      return res.status(200).send({ status: 'ok' });
    } catch (error) {
      const message =
        error.message ??
        'Something went wrong while executing a bulk bekrachtiging.';
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.get(
  '/:id/fracties',
  {
    tags: ['Mandatees'],
    summary: 'List factions of a mandatee',
    operationId: 'listMandateeFactions',
    description:
      'Returns all factions a mandatee belonged to across its successive states.',
    parameters: [idParameter('id', 'UUID of the mandatee.')],
    responses: {
      '200': {
        description: 'The factions the mandatee belonged to.',
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
    const mandatarisId = req.params.id;

    try {
      const fractieIds =
        await mandatarisUsecase.getMandatarisFracties(mandatarisId);
      return res.status(STATUS_CODE.OK).send({ fracties: fractieIds });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while getting all fracties for the different states of mandataris with id: ${mandatarisId}`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.get(
  '/download',
  {
    tags: ['Mandatees'],
    summary: 'Download mandatees',
    operationId: 'downloadMandatees',
    description:
      'Exports a filtered list of mandatees as a CSV file. Filters include bestuursperiode, bestuursorgaan, person, faction, function, and active status.',
    parameters: [
      queryParameter(
        'bestuursperiodeId',
        'UUID of the legislative period to filter on.',
        { type: 'string', format: 'uuid' },
      ),
      queryParameter(
        'bestuursorgaanId',
        'UUID of the governing body to filter on.',
        { type: 'string', format: 'uuid' },
      ),
      queryParameter(
        'persoonIds',
        'Comma-separated UUIDs of persons to filter on.',
        { type: 'string' },
      ),
      queryParameter(
        'fractieIds',
        'Comma-separated UUIDs of factions to filter on.',
        { type: 'string' },
      ),
      queryParameter(
        'bestuursFunctieCodeIds',
        'Comma-separated UUIDs of governing function codes to filter on.',
        { type: 'string' },
      ),
      queryParameter(
        'activeOnly',
        'Only include mandatees that are currently active.',
        { type: 'boolean' },
      ),
      queryParameter('sort', 'Property to sort the mandatees by.', {
        type: 'string',
      }),
    ],
    responses: {
      '200': {
        description: 'A CSV file containing the filtered mandatees.',
        content: {
          'text/csv': {
            schema: { type: 'string', format: 'binary' },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    try {
      const parameters = mandatarisDownloadRequest(req);
      const csvString = await mandatarisDownloadUsecase.toCsv(parameters);

      res.set('Content-Type', 'text/csv');
      res.set(
        'Content-Disposition',
        'attachment; filename="mandatarissen.csv"',
      );
      return res.status(STATUS_CODE.OK).send(csvString);
    } catch (error) {
      const message =
        error.message ??
        'An error occurred while downloading mandatarissen as a CSV file.';
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.post(
  '/generate-rows',
  {
    tags: ['Mandatees'],
    summary: 'Generate draft mandatee rows',
    operationId: 'generateDraftMandatees',
    description:
      'Generates a number of empty draft mandatees for a mandate and period, with an automatically incrementing ranking order.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/GenerateRowsRequest' },
        },
      },
    },
    schemas: {
      GenerateRowsRequest: {
        type: 'object',
        description:
          'Parameters for generating empty draft mandatees for a mandate and period.',
        required: ['count', 'mandaatUri', 'startDate', 'endDate'],
        properties: {
          count: {
            type: 'integer',
            minimum: 1,
            description: 'Number of draft mandatees to create.',
          },
          mandaatUri: {
            type: 'string',
            format: 'uri',
            description: 'URI of the mandate for which rows are created.',
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Start date of the mandatees.',
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'End date of the mandatees.',
          },
          rangordeStartsAt: {
            type: 'integer',
            description:
              'First ranking order number; subsequent rows increment automatically.',
          },
          rangordeLabel: {
            type: 'string',
            description: 'Label used when formatting the ranking order.',
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'The draft mandatees were created.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                ids: {
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
    try {
      const createdIds = await mandatarisUsecase.generateRows(req.body);
      return res.status(STATUS_CODE.OK).send({ ids: createdIds });
    } catch (error) {
      const message =
        error.message ?? 'Something went wrong while generating mandatarissen';
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

export { mandatarissenRouter };
