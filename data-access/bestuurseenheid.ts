import { TERM_TYPE, sparqlEscapeTermValue } from '../util/sparql-escape';
import { findFirstSparqlResult } from '../util/sparql-result';
import { Term } from '../types';
import { querySudo } from '@lblod/mu-auth-sudo';

export async function findBestuurseenheidForMandaat(
  mandaat: Term,
): Promise<Term | null> {
  const queryForId = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?object WHERE {
      ?bestuurseenheid a besluit:Bestuurseenheid.
      ?bestuurseenheid mu:uuid ?object.
      ?bestuursorgaan besluit:bestuurt ?bestuurseenheid .
      ?bestuursorgaanInTijd mandaat:isTijdspecialisatieVan ?bestuursorgaan .
      ?bestuursorgaanInTijd org:hasPost ${sparqlEscapeTermValue(mandaat)} .
    } 
  `;

  const idResult = await querySudo(queryForId);
  const id = findFirstSparqlResult(idResult)?.object;

  if (!id) {
    return null;
  }

  return {
    type: TERM_TYPE.URI,
    value:
      'http://mu.semte.ch/graph/organizations/' +
      id.value +
      '/LoketLB-mandaatGebruiker',
  } as Term;
}
