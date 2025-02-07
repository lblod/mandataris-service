import { Router } from 'express';
import { handleDeltaDecision } from './delta-decisions';
import { handleDeltaPolitiezone } from './delta-politiezones';

const deltaRouter = Router();

deltaRouter.post('/decisions', handleDeltaDecision);
deltaRouter.post('/politiezones', handleDeltaPolitiezone);

export { deltaRouter };
