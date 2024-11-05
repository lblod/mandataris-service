import { sparqlEscapeString, query } from 'mu';
import { getSparqlResults } from '../util/sparql-result';

export const bestuursfunctie = {
  areIdsValid,
};

async function areIdsValid(ids?: Array<string>) {
  if (!ids || ids.length === 0) {
    return {
      isValid: false,
      unknownIds: [],
    };
  }

  const values = ids.map((id) => sparqlEscapeString(id));
  const getNonExisting = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?bestuursfunctieId
    WHERE {
      VALUES ?bestuursfunctieId { ${values.join('\n')} }
      FILTER NOT EXISTS {
        ?bestuursfunctieCode a ext:BestuursfunctieCode.
        ?bestuursfunctieCode mu:uuid ?bestuursfunctieId.
      }
    }
  `;
  const sparqlResult = await query(getNonExisting);
  const nonExistingResults = getSparqlResults(sparqlResult);

  return {
    isValid: nonExistingResults.length === 0,
    unknownIds: nonExistingResults.map((term) => term.bestuursfunctieId?.value),
  };
}
