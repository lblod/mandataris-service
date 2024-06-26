import { Quad, SparqlResult } from './types';

export function getSparqlResults(sparqlResult: SparqlResult): Array<Quad> {
  return sparqlResult.results.bindings;
}

export function findFirstSparqlResult(sparqlResult: SparqlResult): Quad | null {
  const sparqlResults = getSparqlResults(sparqlResult);

  if (sparqlResults.length === 0) {
    return null;
  }

  return sparqlResults[0];
}

export function getBooleanSparqlResult(sparqlResult: SparqlResult): boolean {
  return sparqlResult.boolean ?? false;
}
