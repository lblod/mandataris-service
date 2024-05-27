import { query, sparqlEscapeString } from 'mu';

export const getNbActiveEffectiveMandatarissen = async (mandaatId: string) => {
  const q = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

  SELECT DISTINCT ?mandataris {
    ?mandaat mu:uuid ${sparqlEscapeString(mandaatId)};
        ^org:hasPost ?orgaanInTijd.
    ?mandataris a mandaat:Mandataris;
        mandaat:start ?start;
        org:holds ?mandaat;
        # effectief
        mandaat:status <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75> .
    OPTIONAL {
      ?mandataris mandaat:einde ?end.
      ?orgaanInTijd mandaat:bindingStart ?orgaanStart;
        mandaat:bindingEinde ?orgaanEinde.
      BIND (
        IF (NOW() > ?orgaanEinde, ?orgaanEinde,
          IF (NOW() < ?orgaanStart, ?orgaanStart, NOW())
        ) AS ?date
      )
      FILTER (?end >= ?date)
    }
  }
  `;

  const result = await query(q);
  console.log(result);
  // if (!result.results.bindings.length) {
  //   return { mandates: [], graph: null };
  // }
};
