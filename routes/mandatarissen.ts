import { Request, Response } from 'express';
import multer from 'multer';
import Router from 'express-promise-router';
import { deleteMandataris } from '../data-access/delete';
import { uploadCsv } from '../controllers/mandataris-upload';
import { CsvUploadState } from '../types';

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

export { mandatarissenRouter };
