import { Request, Response } from 'express';
import multer from 'multer';
import Router from 'express-promise-router';
import { deleteMandataris } from '../data-access/delete';
import { uploadCsv } from '../controllers/mandataris-upload';
import { CsvUploadState } from '../types';
import {
  checkLinkedMandataris,
  createLinkedMandataris,
} from '../controllers/linked-mandataris';

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

export { mandatarissenRouter };
