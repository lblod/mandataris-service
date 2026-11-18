import { documentedRouter } from '../util/documented-router';
import { commonErrorResponses } from '../util/openapi';
import { handleDeltaPolitiezone } from './delta-politiezones';

const deltaRouter = documentedRouter();

deltaRouter.post(
  '/politiezones',
  {
    tags: ['Police zones'],
    summary: 'Process police zone deltas',
    operationId: 'processPoliceZoneDeltas',
    description:
      'Receives delta notifications and mirrors changed mandatees and persons into the shared police zone graph.',
    security: [],
    responses: {
      '200': {
        description: 'The delta was processed.',
      },
      ...commonErrorResponses,
    },
  },
  handleDeltaPolitiezone,
);

export { deltaRouter };
