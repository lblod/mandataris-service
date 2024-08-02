import { sparqlEscapeString, sparqlEscapeUri, query } from 'mu';
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

      GRAPH ?graph {
        ?bestuursorgaan a besluit:Bestuursorgaan;
          ext:heeftBestuursperiode ?bestuursperiode.
        ?fractie a mandaat:Fractie;
          mu:uuid ?fractieId;
          org:memberOf ?bestuursorgaan.
      }
      
      FILTER NOT EXISTS {
        ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }
  `;

  const sparqlResult = await query(getQuery);

  return getSparqlResults(sparqlResult);
}

async function addFractieOnPerson(
  personId: string,
  fractieUri: string,
): Promise<void> {
  const escapedFractie = sparqlEscapeUri(fractieUri);
  const insertQuery = `
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ?graph{
        ?persoon extlmb:currentFracties ${escapedFractie} .
      }
    }
    WHERE {
      GRAPH ?graph {
        ?persoon a person:Person;
          mu:uuid ${sparqlEscapeString(personId)}.
      }
      FILTER NOT EXISTS {
        ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }
  `;

  await updateSudo(insertQuery);
}
