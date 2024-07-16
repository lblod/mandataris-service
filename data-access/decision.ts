import { querySudo } from '@lblod/mu-auth-sudo';

import { Term } from '../types';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import { findFirstSparqlResult } from '../util/sparql-result';

export async function findLinkToDocumentOfDecision(
  decision: Term,
): Promise<Term | null> {
  const queryUrl = `
    PREFIX prov: <http://www.w3.org/ns/prov#>

    SELECT ?linkToDocument WHERE {
      ${sparqlEscapeTermValue(decision)} prov:wasDerivedFrom ?linkToDocument.
    }  
  `;

  const result = await querySudo(queryUrl);
  const sparqlResult = findFirstSparqlResult(result);

  if (sparqlResult?.linkToDocument) {
    return sparqlResult.linkToDocument;
  }

  return null;
}
