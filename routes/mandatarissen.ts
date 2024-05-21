import { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import Router from 'express-promise-router';
import { deleteMandataris } from '../data-access/delete';
import { HttpError } from '../util/http-error';

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
    const formData = req.file;
    if (!formData) {
      throw new HttpError('No file provided', 400);
    }
    fs.readFile(formData.path, (err, data) => {
      if (err) throw new HttpError(err?.message, 400);
      console.log(data.toString());
    });
    return res.status(200).send({ status: 'ok' });
  },
);

export { mandatarissenRouter };
