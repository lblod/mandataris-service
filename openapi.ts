import type { DocumentedRouter } from './util/documented-router';
import { getRegisteredRoutes } from './util/documented-router';
import type { OpenApiRouteDoc } from './util/openapi';

const errorContent = {
  'application/json': {
    schema: { $ref: '#/components/schemas/Error' },
  },
};

export interface RouterMount {
  prefix: string;
  router: DocumentedRouter;
}

export const baseOpenApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Mandataris Service API',
    version: '1.0.0',
    description: `
The Mandataris service applies the business rules for mandatees (mandatarissen)
of Flemish local governments to the triplestore. It supports the full mandate
lifecycle: creating, linking, correcting, ratifying, ending, importing, and
exporting mandatees.

### Conventions

- All routes are relative to the service's base URL and are reached through the
  semantic.works dispatcher.
- Identifiers in URLs and request bodies are UUIDs unless stated otherwise.
- Most routes expect a valid \`mu-session-id\` header; authorization is applied
  by the service and by \`mu-authorization\`.
- Responses are JSON unless the action returns a CSV file.
`.trim(),
  },
  servers: [
    {
      url: '/',
      description:
        'Service base URL, reached through the semantic.works dispatcher.',
    },
  ],
  tags: [
    {
      name: 'Mandatees',
      description:
        'Creating, listing, correcting, ratifying, ending, importing and exporting mandatees.',
    },
    {
      name: 'Persons',
      description:
        'Actions on the persons that hold mandates, including their faction and active mandate status.',
    },
    {
      name: 'Factions',
      description:
        'Listing, updating, replacing and deleting political factions (fracties).',
    },
    {
      name: 'Organen',
      description:
        'Queries about the members of a governing body (bestuursorgaan).',
    },
    {
      name: 'Linked mandatees',
      description:
        'Maintaining the mirrored mandate between a municipality and its OCMW.',
    },
    {
      name: 'Ranking order',
      description: 'Updating the ranking order (rangorde) of mandatees.',
    },
    {
      name: 'Mayor appointment',
      description: 'Processing the appointment or rejection of a mayor.',
    },
    {
      name: 'Installation meeting',
      description:
        'Preparing and completing an installation meeting (installatievergadering).',
    },
    {
      name: 'CSV import',
      description: 'Importing mandatees from a CSV file.',
    },
    {
      name: 'Election results',
      description: 'Downloading the results of a direct election.',
    },
    {
      name: 'Police zones',
      description:
        'Mirroring mandatee and person changes into the shared police zone graph.',
    },
    {
      name: 'URL validation',
      description: 'Validating decision document URLs.',
    },
    {
      name: 'Development-only mocks',
      description:
        'Routes that exist for testing and must not be used in production.',
    },
  ],
  security: [{ muSessionId: [] }],
  components: {
    securitySchemes: {
      muSessionId: {
        type: 'apiKey',
        in: 'header',
        name: 'mu-session-id',
        description:
          'Session identifier used by the semantic.works stack to identify the current user and bestuurseenheid.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        description:
          'Error payload returned by the service. Depending on the failing route it contains a message or a list of errors.',
        properties: {
          message: {
            type: 'string',
            description: 'Human-readable error message.',
          },
          errors: {
            type: 'array',
            description:
              'List of errors returned by the central error handler.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description:
          'The request is invalid: identifiers are missing or a required value is absent.',
        content: errorContent,
      },
      Unauthorized: {
        description: 'No valid session was supplied.',
        content: errorContent,
      },
      Forbidden: {
        description:
          'The session does not have access to the requested resource or bestuurseenheid.',
        content: errorContent,
      },
      NotFound: {
        description: 'The requested resource could not be found.',
        content: errorContent,
      },
      InternalServerError: {
        description:
          'An unexpected error occurred while processing the request.',
        content: errorContent,
      },
    },
  },
};

export function buildOpenApiDocument(mounts: RouterMount[]) {
  const paths: Record<string, Record<string, OpenApiRouteDoc>> = {};
  const baseSchemas = baseOpenApiDocument.components.schemas as Record<
    string,
    unknown
  >;
  const routeSchemas: Record<string, unknown> = {};

  for (const mount of mounts) {
    const routes = getRegisteredRoutes(mount.router);
    if (routes.length === 0) {
      throw new Error(
        `No documented routes found for router mounted at "${mount.prefix}". Use documentedRouter() and define at least one route.`,
      );
    }

    for (const route of routes) {
      const path = toOpenApiPath(joinPaths(mount.prefix, route.path));
      const pathItem = paths[path] ?? (paths[path] = {});
      if (pathItem[route.method]) {
        throw new Error(
          `Duplicate OpenAPI operation ${route.method.toUpperCase()} ${path}.`,
        );
      }

      const { schemas, ...operation } = route.doc;
      if (schemas) {
        for (const name of Object.keys(schemas)) {
          if (baseSchemas[name] || routeSchemas[name]) {
            throw new Error(
              `Duplicate OpenAPI schema "${name}" defined by operation ${route.doc.operationId}.`,
            );
          }
          routeSchemas[name] = schemas[name];
        }
      }

      validatePathParameters(path, route.doc);
      pathItem[route.method] = operation;
    }
  }

  const document = {
    ...baseOpenApiDocument,
    components: {
      ...baseOpenApiDocument.components,
      schemas: {
        ...baseSchemas,
        ...routeSchemas,
      },
    },
    paths,
  };

  validateReferences(document);

  return document;
}

function joinPaths(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
}

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function validatePathParameters(path: string, doc: OpenApiRouteDoc): void {
  const pathParameters: string[] = [];
  const pattern = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(path)) !== null) {
    pathParameters.push(match[1]);
  }

  const documented = (doc.parameters ?? [])
    .filter((parameter) => parameter.in === 'path')
    .map((parameter) => parameter.name);

  for (const name of pathParameters) {
    if (documented.indexOf(name) === -1) {
      throw new Error(
        `Operation ${doc.operationId} does not document path parameter "${name}" for ${path}.`,
      );
    }
  }

  for (const name of documented) {
    if (pathParameters.indexOf(name) === -1) {
      throw new Error(
        `Operation ${doc.operationId} documents path parameter "${name}" that is not present in ${path}.`,
      );
    }
  }
}

function validateReferences(document: unknown): void {
  const refs: string[] = [];
  collectReferences(document, refs);

  for (const ref of refs) {
    if (!ref.startsWith('#/')) {
      throw new Error(
        `OpenAPI document contains unsupported external reference "${ref}".`,
      );
    }
    if (resolveJsonPointer(document, ref.slice(2)) === undefined) {
      throw new Error(
        `OpenAPI document contains unresolved reference "${ref}".`,
      );
    }
  }
}

function collectReferences(value: unknown, refs: string[]): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferences(item, refs);
    }
    return;
  }

  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key === '$ref' && typeof object[key] === 'string') {
      refs.push(object[key] as string);
    } else {
      collectReferences(object[key], refs);
    }
  }
}

function resolveJsonPointer(document: unknown, pointer: string): unknown {
  let current: unknown = document;

  for (const rawPart of pointer.split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    if (
      current === null ||
      typeof current !== 'object' ||
      !(part in (current as Record<string, unknown>))
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
