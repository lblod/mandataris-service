import Router from 'express-promise-router';

import { Request, Response } from 'express';
import multer from 'multer';

import { mandatarisDownloadRequest } from '../Requests/mandataris-download';

import { deleteMandatarisWithTombstone } from '../data-access/delete';

import {
  addLinkLinkedMandataris,
  addSimpleReplacement,
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
import { HttpError } from '../util/http-error';

const upload = multer({ dest: 'mandataris-uploads/' });

const mandatarissenRouter = Router();

mandatarissenRouter.delete('/:id', async (req: Request, res: Response) => {
  const withLinked = req.query.withLinked === 'true';
  await deleteMandatarisWithTombstone(req.params.id, withLinked);
  return res.status(204).send();
});

mandatarissenRouter.post(
  '/upload-csv',
  upload.single('file'),
  async (req: Request, res: Response) => {
    const state: CsvUploadState & { status?: string } = await uploadCsv(req);
    state.status = state.errors.length > 0 ? 'error' : 'ok';
    res.status(200).send(state);
  },
);

mandatarissenRouter.get(
  '/check-ownership',
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

mandatarissenRouter.put(
  '/:id/correct-linked-mandataris',
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

mandatarissenRouter.put(
  '/:oldId/:newId/update-state-linked-mandataris',
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

mandatarissenRouter.put(
  '/:id/add-linked-replacement',
  async (req: Request, res: Response) => {
    try {
      await addSimpleReplacement(req);
      return res.status(200).send({ status: 'ok' });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while adding replacement to duplicate mandate for: ${req.params.id}. Please try again later.`;
      const statusCode = error.status ?? 500;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.post(
  '/:from/:to/add-link-linked-mandataris',
  async (req: Request, res: Response) => {
    try {
      await addLinkLinkedMandataris(req);
      return res.status(200).send({ status: 'ok' });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while adding link between mandates ${req.params.from} and ${req.params.to}. Please try again later.`;
      const statusCode = error.status ?? 500;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.delete(
  '/:id/remove-link-linked-mandataris',
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

mandatarissenRouter.put(
  '/:id/copy/:newId',
  async (req: Request, res: Response) => {
    try {
      const mandatarisId = req.params.id;
      const newMandatarisId = req.params.newId;
      const update =
        await mandatarisUsecase.copyOverNonResourceDomainPredicates(
          mandatarisId,
          newMandatarisId,
        );
      return res.status(STATUS_CODE.OK).send({
        message: `Added ${update.itemsAdded} predicates to mandataris with id: ${update.mandatarisId}`,
      });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while copying over no resource domain predicates from mandataris with id: ${req.params.id}.`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

mandatarissenRouter.post(
  '/bulk-set-publication-status/',
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

mandatarissenRouter.get('/download', async (req: Request, res: Response) => {
  try {
    const parameters = mandatarisDownloadRequest(req);
    const csvString = await mandatarisDownloadUsecase.toCsv(parameters);

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="mandatarissen.csv"');
    return res.status(STATUS_CODE.OK).send(csvString);
  } catch (error) {
    const message =
      error.message ??
      'An error occurred while downloading mandatarissen as a CSV file.';
    const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
    return res.status(statusCode).send({ message });
  }
});

mandatarissenRouter.post(
  '/generate-rows',
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
