import { query, sparqlEscapeString } from 'mu';
import { getSparqlResults } from '../util/sparql-result';
import { TermProperty } from '../types';

export const fractie = {
  forBestuursperiode,
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
