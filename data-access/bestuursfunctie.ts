import { sparqlEscapeString, query } from 'mu';
import { getBooleanSparqlResult } from '../util/sparql-result';

export const bestuursfunctie = {
  isValidId,
};

async function isValidId(id: string): Promise<boolean> {
  const askQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    ASK {
      ?bestuursfunctieCode a ext:BestuursfunctieCode;
        mu:uuid ${sparqlEscapeString(id)}.
    }
  `;
  const sparqlResult = await query(askQuery);

  return getBooleanSparqlResult(sparqlResult);
}
