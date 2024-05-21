import { Request, Response } from 'express';
import multer from 'multer';
import Router from 'express-promise-router';
import { deleteMandataris } from '../data-access/delete';
import { uploadCsv } from '../controllers/mandataris-upload';

const upload = multer({ dest: 'mandataris-uploads/' });

const mandatarissenRouter = Router();

mandatarissenRouter.delete('/:id', async (req: Request, res: Response) => {
  await deleteMandataris(req.params.id);
  return res.status(204).send();
});

mandatarissenRouter.post(
  '/upload-csv',
  upload.single('csv'),
  async (req: Request, res: Response) => {
    uploadCsv(req, res);
  },
);

export { mandatarissenRouter };
