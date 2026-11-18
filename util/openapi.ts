export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: Record<string, unknown>;
}

export interface OpenApiRouteDoc {
  tags: string[];
  summary: string;
  description: string;
  operationId: string;
  parameters?: OpenApiParameter[];
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
  /**
   * Component schemas owned by this route. These are merged into
   * `components.schemas` when the OpenAPI document is built and are not
   * emitted as part of the operation.
   */
  schemas?: Record<string, unknown>;
}

export const idParameter = (
  name: string,
  description: string,
): OpenApiParameter => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});

export const queryParameter = (
  name: string,
  description: string,
  schema: Record<string, unknown>,
  required = false,
): OpenApiParameter => ({
  name,
  in: 'query',
  required,
  description,
  schema,
});

export const commonErrorResponses = {
  '400': { $ref: '#/components/responses/BadRequest' },
  '401': { $ref: '#/components/responses/Unauthorized' },
  '403': { $ref: '#/components/responses/Forbidden' },
  '500': { $ref: '#/components/responses/InternalServerError' },
};
