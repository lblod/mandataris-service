import { Router } from 'express';
import { handleDeltaPolitiezone } from './delta-politiezones';

const deltaRouter = Router();

deltaRouter.post('/politiezones', handleDeltaPolitiezone);

export { deltaRouter };
