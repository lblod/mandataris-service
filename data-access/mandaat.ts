import {
  query,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';

import { MANDATARIS_STATUS } from '../util/constants';

export const getNbActiveMandatarissen = async (mandaatId: string) => {
  const now = sparqlEscapeDateTime(new Date());
  const escapedStatus = [
    sparqlEscapeUri(MANDATARIS_STATUS.EFFECTIEF),
    sparqlEscapeUri(MANDATARIS_STATUS.VERHINDERD),
    sparqlEscapeUri(MANDATARIS_STATUS.TITELVOEREND),
  ];
  const q = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  SELECT (COUNT(DISTINCT ?mandataris) as ?count) WHERE {
    GRAPH ?g {
      ?mandaat mu:uuid ${sparqlEscapeString(mandaatId)};
          ^org:hasPost ?orgaanInTijd.
      ?mandataris a mandaat:Mandataris;
          org:holds ?mandaat;
          mandaat:isBestuurlijkeAliasVan ?persoon.
      OPTIONAL {
        ?mandataris mandaat:status ?status.
      }
      OPTIONAL {
        ?mandataris mandaat:einde ?mandatarisEinde.
      }
      OPTIONAL {
        ?orgaanInTijd mandaat:bindingEinde ?orgaanEinde.
      }
    }
    BIND(IF(BOUND(?orgaanEinde), ?orgaanEinde, ${now}) AS ?actualOrgaanEinde).
    # The end of the bestuursperiode is sometimes a day later, so subtract a day to be sure.
    BIND(IF(?actualOrgaanEinde <= ${now}, ?actualOrgaanEinde - "P1D"^^xsd:duration, ${now}) AS ?testEinde).
    FILTER(!BOUND(?mandatarisEinde) || ?mandatarisEinde >= ?testEinde).
    # Filter mandatarissen that are either effectief, verhinderd or titelvoerend (or have no status)
    FILTER(!BOUND(?status) || ?status IN ( ${escapedStatus.join(', ')} )).

    ?g ext:ownedBy ?owningEenheid.
  }
  `;

  const result = await query(q);
  return parseInt(result.results.bindings[0]?.count?.value, 10) || 0;
};
