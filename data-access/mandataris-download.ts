import { query, sparqlEscapeString } from 'mu';
import { getSparqlResults } from '../util/sparql-result';

export const downloadMandatarissen = {
  withFilters,
};

async function withFilters(filters) {
  const { bestuursperiodeId } = filters;
  // TODO: remove limit/
  const queryString = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT ?mandataris
    WHERE {
      ?mandataris a mandaat:Mandataris.
      ?mandataris org:holds ?mandaat.

      ?bestuursorgaan lmb:heeftBestuursperiode ?bestuurspriode.
      ?bestuursperiode mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
    }
    LIMIT 100 
  `;

  const sparqlResult = await query(queryString);

  return getSparqlResults(sparqlResult);
}
