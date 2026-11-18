import { Request, Response } from 'express';
import { getActivePersonen } from '../data-access/orgaan';
import { documentedRouter } from '../util/documented-router';
import { commonErrorResponses, idParameter } from '../util/openapi';

const organenRouter = documentedRouter();

organenRouter.get(
  '/:orgaanId/activeMembers',
  {
    tags: ['Organen'],
    summary: 'Count active members of a governing body',
    operationId: 'countActiveMembers',
    description:
      'Returns the number of persons with an active mandate in the given governing body.',
    parameters: [idParameter('orgaanId', 'UUID of the governing body.')],
    responses: {
      '200': {
        description: 'The number of active members.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { count: { type: 'integer' } },
            },
          },
        },
      },
      ...commonErrorResponses,
    },
  },
  async (req: Request, res: Response) => {
    const count = await getActivePersonen(req.params.orgaanId);
    return res.send({ count });
  },
);

export { organenRouter };
