import { TERM_TYPE, sparqlEscapeTermValue } from '../util/sparql-escape';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
} from '../util/sparql-result';
import { Term } from '../types';
import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';

export const bestuurseenheid = {
  isExisiting,
};

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

    SELECT ?id WHERE {
      ?bestuurseenheid a besluit:Bestuurseenheid.
      ?bestuurseenheid mu:uuid ?id.
      ?bestuursorgaan besluit:bestuurt ?bestuurseenheid .
      ?bestuursorgaanInTijd mandaat:isTijdspecialisatieVan ?bestuursorgaan .
      ?bestuursorgaanInTijd org:hasPost ${sparqlEscapeTermValue(mandaat)} .
    } 
  `;

  const idResult = await querySudo(queryForId);
  const result = findFirstSparqlResult(idResult);

  if (!result) {
    return null;
  }

  return {
    type: TERM_TYPE.URI,
    value:
      'http://mu.semte.ch/graph/organizations/' +
      result.id.value +
      '/LoketLB-mandaatGebruiker',
  } as Term;
}

async function isExisiting(bestuurseenheidUri: string): Promise<boolean> {
  const askIfExists = `
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

      ASK {
        GRAPH ?bestuurseenheidGraph {
          ${sparqlEscapeUri(bestuurseenheidUri)} a besluit:Bestuurseenheid.
        }

        FILTER ( ?bestuurseenheidGraph != <http://mu.semte.ch/vocabularies/ext/FormHistory>)
      }
    `;

  const result = await querySudo(askIfExists);
  const booleanResult = getBooleanSparqlResult(result);

  return booleanResult;
}
