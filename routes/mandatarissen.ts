import Router from 'express-promise-router';

import { Request, Response } from 'express';
import multer from 'multer';

import { deleteMandataris } from '../data-access/delete';
import { uploadCsv } from '../controllers/mandataris-upload';
import { CsvUploadState } from '../types';
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
  '/:id/isActive',
  async (req: Request, res: Response) => {
    try {
      const mandatarisId = req.params.id;
      const isActive = await mandatarisUsecase.isActive(mandatarisId);

      return res.status(STATUS_CODE.OK).send({ isActive: isActive ?? false });
    } catch (error) {
      return res
        .status(error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR)
        .send({
          isActive: false,
          message:
            error.message ??
            `Something went wrong while checking if mandataris: ${
              req.params.id ?? null
            } is active.`,
        });
    }
  },
);

mandatarissenRouter.get(
  '/:id/bestuursperiode',
  async (req: Request, res: Response) => {
    try {
      const mandatarisId = req.params.id;
      const bestuursperiodeUri =
        await mandatarisUsecase.getBestuursperiode(mandatarisId);

      return res
        .status(STATUS_CODE.OK)
        .send({ bestuursperiodeUri: bestuursperiodeUri ?? false });
    } catch (error) {
      return res
        .status(error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR)
        .send({
          message:
            error.message ??
            `Something went wrong while getting the bestuursperiode for mandataris: ${
              req.params.id ?? null
            }.`,
        });
    }
  },
);

export { mandatarissenRouter };
