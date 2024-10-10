import { Request, Response } from 'express';
import multer from 'multer';
import Router from 'express-promise-router';
import { deleteMandataris } from '../data-access/delete';
import { uploadCsv } from '../controllers/mandataris-upload';
import { CsvUploadState } from '../types';
import {
  addLinkLinkedMandataris,
  changeStateLinkedMandataris,
  checkLinkedMandataris,
  correctMistakesLinkedMandataris,
  createLinkedMandataris,
} from '../controllers/linked-mandataris';
import { mandatarisUsecase } from '../controllers/mandataris';
import { STATUS_CODE } from '../util/constants';

const upload = multer({ dest: 'mandataris-uploads/' });

const mandatarissenRouter = Router();

mandatarissenRouter.delete('/:id', async (req: Request, res: Response) => {
  await deleteMandataris(req.params.id);
  return res.status(204).send();
});

mandatarissenRouter.post(
  '/upload-csv',
  upload.single('file'),
  async (req: Request, res: Response) => {
    const state: CsvUploadState & { status?: string } = await uploadCsv(req);
    state.status = state.errors.length > 0 ? 'error' : 'ok';
    return res.status(200).send(state);
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

mandatarissenRouter.get(
  '/:id/decision',
  async (req: Request, res: Response) => {
    try {
      const mandatarisId = req.params.id;
      const foundDecision = await mandatarisUsecase.findDecision(mandatarisId);

      return res.status(STATUS_CODE.OK).send({
        decisionUri: foundDecision,
      });
    } catch (error) {
      const message =
        error.message ??
        `Something went wrong while getting the decision of the mandataris with id: ${req.params.id}.`;
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

export { mandatarissenRouter };
