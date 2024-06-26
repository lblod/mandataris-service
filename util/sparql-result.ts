import { Quad, SparqlResult } from './types';

export function findFirstSparqlResult(sparqlResult: SparqlResult): Quad | null {
  if (sparqlResult.results.bindings.length === 0) {
    return null;
  }

  return sparqlResult.results.bindings[0];
}

export function getBooleanSparqlResult(sparqlResult: SparqlResult): boolean {
  return sparqlResult.boolean ?? false;
}
