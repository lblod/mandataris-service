import {
  query,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';

export async function getActivePersonen(bestuursorgaanId: string) {
  const now = sparqlEscapeDateTime(new Date());
  const safeStatussen = [
    sparqlEscapeUri(
      'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75', // Effectief
    ),
    sparqlEscapeUri(
      'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/e1ca6edd-55e1-4288-92a5-53f4cf71946a', // Waarnemend
    ),
  ];
  const result = await query(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

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

      BIND(IF(BOUND(?orgaanEinde), ?orgaanEinde, ${now}) AS ?actualOrgaanEinde).
      BIND(IF(?actualOrgaanEinde <= ${now}, ?actualOrgaanEinde, ${now}) AS ?testEinde).
      FILTER(!BOUND(?mandatarisEinde) || ?mandatarisEinde >= ?testEinde).
      FILTER(!BOUND(?status) || ?status IN (${safeStatussen.join(', ')})).
    }
  `);

  return parseInt(result?.results?.bindings[0]?.count?.value, 10) || 0;
}
