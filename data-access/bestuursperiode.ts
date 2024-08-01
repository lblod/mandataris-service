import { sparqlEscapeString } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { getBooleanSparqlResult } from '../util/sparql-result';

export const bestuursperiode = {
  isValidId,
};

async function isValidId(id: string): Promise<boolean> {
  const askQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    ASK {
      ?bestuursperiode a ext:Bestuursperiode;
        mu:uuid ${sparqlEscapeString(id)}.
    }
  `;
  const sparqlResult = await querySudo(askQuery);

  return getBooleanSparqlResult(sparqlResult);
}
