import { query, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';

export const getNbActiveMandatarissen = async (mandaatId: string) => {
  const now = sparqlEscapeDateTime(new Date());
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
    FILTER(!BOUND(?status) || ?status IN (<http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75>, <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/c301248f-0199-45ca-b3e5-4c596731d5fe>, <http://data.vlaanderen.be/id/concept/MandatarisStatusCode/aacb3fed-b51d-4e0b-a411-f3fa641da1b3>)).

    ?g ext:ownedBy ?owningEenheid.
  }
  `;

  const result = await query(q);
  return parseInt(result.results.bindings[0]?.count?.value, 10) || 0;
};
