import { sparqlEscapeString } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
} from '../util/sparql-result';
import { HttpError } from '../util/http-error';
import { STATUS_CODE } from '../util/constants';

export const bestuursperiode = {
  exists,
  getIdForUri,
};

async function exists(bestuursperiodeId: string): Promise<boolean> {
  const askIfExists = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

      ASK {
        GRAPH ?bestuursperiodeGraph {
          ?bestuursperiode a ext:Bestuursperiode;
            mu:uuid ${sparqlEscapeString(bestuursperiodeId)}.
        }
        FILTER NOT EXISTS {
          ?bestuursperiodeGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
        }
      }
    `;

  const result = await querySudo(askIfExists);

  return getBooleanSparqlResult(result);
}

async function getIdForUri(bestuursperiodeUri: string): Promise<string> {
  const askIfExists = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

      SELECT ?id {
        GRAPH ?bestuursperiodeGraph {
          ?bestuursperiode a ext:Bestuursperiode;
            mu:uuid ?id.
        }
        FILTER NOT EXISTS {
          ?bestuursperiodeGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
        }
      }
    `;

  const results = await querySudo(askIfExists);
  const first = findFirstSparqlResult(results);

  if (!first) {
    throw new HttpError(
      `No bestuursperiode found with uri: ${bestuursperiodeUri}`,
      STATUS_CODE.NOT_FOUND,
    );
  }

  return first.id.value;
}
