import { sparqlEscapeString } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { getBooleanSparqlResult } from '../util/sparql-result';

export const bestuursperiode = {
  isExisting,
};

async function isExisting(bestuursperiodeId: string): Promise<boolean> {
  const askIfExists = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

      ASK {
        GRAPH ?bestuursperiodeGraph {
          ?bestuursperiode a ext:Bestuursperiode;
            mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
        }

        FILTER ( ?bestuursperiodeGraph != <http://mu.semte.ch/vocabularies/ext/FormHistory> )
      }
    `;

  const result = await querySudo(askIfExists);

  return getBooleanSparqlResult(result);
}
