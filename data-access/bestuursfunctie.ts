import { sparqlEscapeString, query } from 'mu';
import { findFirstSparqlResult } from '../util/sparql-result';

export const bestuursfunctie = {
  areIdsValid,
};

async function areIdsValid(ids?: Array<string>): Promise<boolean> {
  if (!ids || ids.length === 0) {
    return false;
  }

  const values = ids.map((id) => sparqlEscapeString(id));
  const countOfExisting = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT (COUNT(DISTINCT ?bestuursfunctieCode ) as ?count)
    WHERE {
      VALUES ?bestuursfunctieId { ${values.join('\n')} }
      FILTER NOT EXISTS {
        ?bestuursfunctieCode a ext:BestuursfunctieCode.
        ?bestuursfunctieCode mu:uuid ?bestuursfunctieId.
      }
    }
  `;
  const sparqlResult = await query(countOfExisting);
  const result = findFirstSparqlResult(sparqlResult);
  if (!result) {
    return false;
  }

  const count = parseInt(result.count?.value);
  return !isNaN(count) && count === ids.length;
}
