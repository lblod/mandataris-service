import { query, sparqlEscapeString } from 'mu';

export const getNbActiveEffectiveMandatarissen = async (mandaatId: string) => {
  const q = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

  SELECT (COUNT(DISTINCT ?mandataris) as ?count) WHERE {
    ?mandaat mu:uuid ${sparqlEscapeString(mandaatId)};
        ^org:hasPost ?orgaanInTijd.
    ?mandataris a mandaat:Mandataris;
        org:holds ?mandaat;
        # effectief
        mandaat:status <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75> .
    OPTIONAL {
      ?mandataris mandaat:einde ?mandatarisEinde.
    }
    OPTIONAL {
      ?orgaanInTijd mandaat:bindingEinde ?orgaanEinde.
    }
  }
  `;

  const result = await query(q);
  return parseInt(result.results.bindings[0]?.count?.value, 10) || 0;
};
