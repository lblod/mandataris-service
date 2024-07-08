import multer from 'multer';
import { Request, Response } from 'express';

import Router from 'express-promise-router';
import { checkAuthorization } from '../data-access/burgemeester';
import { onBurgemeesterBenoemingSafe } from '../controllers/burgemeester-benoeming';

const burgemeesterRouter = Router();

const upload = multer({ dest: '/uploads/' });

burgemeesterRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      await checkAuthorization(req);
      await onBurgemeesterBenoemingSafe(req);
      res
        .status(200)
        .send({ message: `Burgemeester-benoeming: ${req.body.status}` });
    } catch (e) {
      const status = e.status || 500;
      res.status(status).send({ error: e.message });
      console.error(`[${status}]: ${e.message}`);
      console.error(e.stack);
    }
  },
);

export { burgemeesterRouter };
