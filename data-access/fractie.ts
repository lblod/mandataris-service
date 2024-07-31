import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { updateSudo } from '@lblod/mu-auth-sudo';

import { getSparqlResults } from '../util/sparql-result';
import { TermProperty } from '../types';

export const fractie = {
  forBestuursperiode,
  addFractieOnPerson,
};

async function forBestuursperiode(
  bestuursperiodeId: string,
): Promise<Array<TermProperty>> {
  const getQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT DISTINCT ?fractieId
    WHERE {
      ?bestuursperiode a ext:Bestuursperiode;
        mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.

      ?bestuursorgaan a besluit:Bestuursorgaan;
        ext:heeftBestuursperiode ?bestuursperiode.

      ?fractie a mandaat:Fractie;
        mu:uuid ?fractieId;
        org:memberOf ?bestuursorgaan.
    }
  `;

  const sparqlResult = await query(getQuery);

  return getSparqlResults(sparqlResult);
}

async function addFractieOnPerson(personUri: string, fractieUri: string) {
  const escapedFractie = sparqlEscapeUri(fractieUri);
  const insertQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>

    INSERT {
      GRAPH ?graph{
        ${sparqlEscapeUri(personUri)} extlmb:currentFracties ${escapedFractie} .
      }
    }
    WHERE {
      GRAPH ?graph{
        ${sparqlEscapeUri(personUri)} a person:Person.
      }
      FILTER NOT EXISTS {
        ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }
  `;

  await updateSudo(insertQuery);
}
