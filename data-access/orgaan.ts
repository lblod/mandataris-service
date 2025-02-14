import {
  query,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import moment from 'moment';

import { PUBLICATION_STATUS } from '../util/constants';

export async function getActivePersonen(bestuursorgaanId: string) {
  const draftPublicatieStatus = sparqlEscapeUri(PUBLICATION_STATUS.DRAFT);
  const safeStatussen = [
    sparqlEscapeUri(
      'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75', // Effectief
    ),
    sparqlEscapeUri(
      'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/c301248f-0199-45ca-b3e5-4c596731d5fe', // Verhinderd
    ),
  ];

  const effectiveEndDateQuery = `
   PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
   PREFIX org: <http://www.w3.org/ns/org#>
   PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

   SELECT (MAX(?mandatarisEinde) AS ?effectiveEndDate)
   WHERE {
     ?boi mu:uuid ${sparqlEscapeString(bestuursorgaanId)} .
     ?boi org:hasPost / ^org:holds ?mandataris  .
     ?mandataris mandaat:einde ?mandatarisEinde.
   }`;

  const effectiveEndDateResult = await query(effectiveEndDateQuery);
  let effectiveEndDate =
    effectiveEndDateResult?.results?.bindings[0]?.effectiveEndDate?.value ||
    new Date();
  if (moment(effectiveEndDate).isAfter(new Date())) {
    // if the end date is in the future, it means we are looking at the current organ. Return the currently active mandatarissen
    effectiveEndDate = new Date();
  }
  // especially old data has incorrect hours in their end date. Let's give ourselves two hours of margin
  const effectiveEndDateWithMargin = moment(effectiveEndDate)
    .subtract(2, 'hours')
    .toDate();

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

      ?mandataris mandaat:isBestuurlijkeAliasVan ?persoon .
      ?mandataris mandaat:start ?mandatarisStart.
      OPTIONAL {
        ?mandataris mandaat:einde ?mandatarisEinde.
      }
      OPTIONAL {
        ?mandataris mandaat:status ?status.
      }

      FILTER NOT EXISTS {
        ?mandataris lmb:hasPublicationStatus ${draftPublicatieStatus} .
      }
      VALUES ?dateToCheck {
        ${sparqlEscapeDateTime(effectiveEndDateWithMargin)}
      }

      FILTER(!BOUND(?mandatarisEinde) || ?mandatarisEinde >= ?dateToCheck).
      FILTER(?mandatarisStart <= ?dateToCheck ).
      FILTER(!BOUND(?status) || ?status IN (${safeStatussen.join(', ')})).
    }
  `);

  return parseInt(result?.results?.bindings[0]?.count?.value, 10) || 0;
}
