import multer from 'multer';
import Router from 'express-promise-router';
import { onBurgemeesterBenoeming } from '../controllers/burgemeester-benoeming';

const burgemeesterRouter = Router();

const upload = multer({ dest: '/uploads/' });

burgemeesterRouter.post('/', upload.single('file'), onBurgemeesterBenoeming);

export { burgemeesterRouter };
