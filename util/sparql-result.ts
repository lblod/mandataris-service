import { TermProperty, SparqlResult } from '../types';

export function getSparqlResults(
  sparqlResult: SparqlResult,
): Array<TermProperty> {
  return sparqlResult.results.bindings;
}

export function findFirstSparqlResult(
  sparqlResult: SparqlResult,
): TermProperty | null {
  const sparqlResults = getSparqlResults(sparqlResult);

  if (sparqlResults.length === 0) {
    return null;
  }

  return sparqlResults[0];
}

export function getBooleanSparqlResult(sparqlResult: SparqlResult): boolean {
  return sparqlResult.boolean ?? false;
}
