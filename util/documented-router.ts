import Router from 'express-promise-router';
import type { RequestHandler, Router as ExpressRouter } from 'express';

import type { OpenApiRouteDoc } from './openapi';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RegisteredRoute {
  method: HttpMethod;
  path: string;
  doc: OpenApiRouteDoc;
}

type DocumentedMethod = (
  path: string,
  doc: OpenApiRouteDoc,
  ...handlers: RequestHandler[]
) => void;

export interface DocumentedRouter extends RequestHandler {
  get: DocumentedMethod;
  post: DocumentedMethod;
  put: DocumentedMethod;
  patch: DocumentedMethod;
  delete: DocumentedMethod;
  use: ExpressRouter['use'];
}

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];
const routesByRouter = new WeakMap<object, RegisteredRoute[]>();

export function documentedRouter(): DocumentedRouter {
  const router = Router();
  const routes: RegisteredRoute[] = [];
  routesByRouter.set(router, routes);

  for (const method of HTTP_METHODS) {
    const register = (router as any)[method].bind(router) as (
      path: string,
      ...handlers: RequestHandler[]
    ) => void;

    (router as any)[method] = (
      path: string,
      doc: OpenApiRouteDoc,
      ...handlers: RequestHandler[]
    ) => {
      validateRouteDoc(method, path, doc);
      routes.push({ method, path, doc });
      register(path, ...handlers);
    };
  }

  return router as unknown as DocumentedRouter;
}

export function getRegisteredRoutes(router: object): RegisteredRoute[] {
  return routesByRouter.get(router) ?? [];
}

function validateRouteDoc(
  method: HttpMethod,
  path: string,
  doc: OpenApiRouteDoc,
): void {
  const route = `${method.toUpperCase()} ${path}`;

  if (!path.startsWith('/')) {
    throw new Error(`Route ${route} must start with "/".`);
  }

  if (!doc) {
    throw new Error(`Route ${route} has no OpenAPI documentation.`);
  }

  const requiredFields: Array<keyof OpenApiRouteDoc> = [
    'tags',
    'summary',
    'description',
    'operationId',
    'responses',
  ];

  for (const field of requiredFields) {
    if (!doc[field]) {
      throw new Error(
        `Route ${route} is missing OpenAPI field "${String(field)}".`,
      );
    }
  }

  if (!Array.isArray(doc.tags) || doc.tags.length === 0) {
    throw new Error(`Route ${route} must have at least one OpenAPI tag.`);
  }

  if (Object.keys(doc.responses).length === 0) {
    throw new Error(`Route ${route} must document at least one response.`);
  }
}
