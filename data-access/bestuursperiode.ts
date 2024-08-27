import { sparqlEscapeString, query } from 'mu';
import { getBooleanSparqlResult } from '../util/sparql-result';

export const bestuursperiode = {
  isValidId,
};

async function isValidId(id: string): Promise<boolean> {
  const askQuery = `
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    ASK {
      ?bestuursperiode a lmb:Bestuursperiode;
        mu:uuid ${sparqlEscapeString(id)}.
    }
  `;
  const sparqlResult = await query(askQuery);

  return getBooleanSparqlResult(sparqlResult);
}
