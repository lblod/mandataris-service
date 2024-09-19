import { TERM_TYPE, sparqlEscapeTermValue } from '../util/sparql-escape';
import { findFirstSparqlResult } from '../util/sparql-result';
import { Term } from '../types';
import { querySudo } from '@lblod/mu-auth-sudo';

export const bestuurseenheid_sudo = {
  getContactEmailFromMandataris,
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

async function getContactEmailFromMandataris(mandatarisUri: Term) {
  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?email WHERE {
      ${sparqlEscapeTermValue(mandatarisUri)} a mandaat:Mandataris;
        org:holds ?mandaat.

      ?bestuurseenheid a besluit:Bestuurseenheid.
      ?bestuursorgaan besluit:bestuurt ?bestuurseenheid .
      ?bestuursorgaanInTijd mandaat:isTijdspecialisatieVan ?bestuursorgaan .
      ?bestuursorgaanInTijd org:hasPost ?mandaat .

      OPTIONAL {
        ?bestuurseenheid ext:mailAdresVoorNotificaties ?email.
      }
    } LIMIT 1
  `;
  const sparqlResult = await querySudo(query);
  console.log(sparqlResult);
  const result = findFirstSparqlResult(sparqlResult);

  return result?.email;
}
