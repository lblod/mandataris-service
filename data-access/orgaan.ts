import {
  query,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';

import { PUBLICATION_STATUS } from '../util/constants';

export async function getActivePersonen(bestuursorgaanId: string) {
  const now = sparqlEscapeDateTime(new Date());
  const draftPublicatieStatus = sparqlEscapeUri(PUBLICATION_STATUS.DRAFT);
  const safeStatussen = [
    sparqlEscapeUri(
      'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75', // Effectief
    ),
    sparqlEscapeUri(
      'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/c301248f-0199-45ca-b3e5-4c596731d5fe', // Verhinderd
    ),
  ];
  const result = await query(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT (COUNT(DISTINCT ?persoon) AS ?count)
    WHERE {
      ?boi mu:uuid ${sparqlEscapeString(bestuursorgaanId)} .
      ?boi org:hasPost / ^org:holds ?mandataris  .

      OPTIONAL {
        ?boi mandaat:bindingEinde ?orgaanEinde.
      }

      ?mandataris mandaat:isBestuurlijkeAliasVan ?persoon .
      OPTIONAL {
        ?mandataris mandaat:einde ?mandatarisEinde.
      }
      OPTIONAL {
        ?mandataris mandaat:status ?status.
      }

      FILTER NOT EXISTS {
        ?mandataris lmb:hasPublicationStatus ${draftPublicatieStatus}
      }

      BIND(IF(BOUND(?orgaanEinde), ?orgaanEinde, ${now}) AS ?actualOrgaanEinde).
      BIND(IF(?actualOrgaanEinde <= ${now}, ?actualOrgaanEinde, ${now}) AS ?testEinde).
      FILTER(!BOUND(?mandatarisEinde) || ?mandatarisEinde >= ?testEinde).
      FILTER(!BOUND(?status) || ?status IN (${safeStatussen.join(', ')})).
    }
  `);

  return parseInt(result?.results?.bindings[0]?.count?.value, 10) || 0;
}
