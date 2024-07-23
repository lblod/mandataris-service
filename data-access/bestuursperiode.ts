import { BASE_RESOURCE } from '../util/constants';
import { sparqlEscapeUri } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { getBooleanSparqlResult } from '../util/sparql-result';

export const bestuursperiode = {
  isExisting,
};

async function isExisting(bestuursperiodeId: string): Promise<boolean> {
  const uri = BASE_RESOURCE.BESTUURSPERIODE + bestuursperiodeId;
  const askIfExists = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

      ASK {
        GRAPH ?bestuursperiodeGraph {
          ${sparqlEscapeUri(uri)} a ext:Bestuursperiode.
        }

        FILTER NOT EXISTS {
          ?bestuursperiodeGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
        }
      }
    `;

  const result = await querySudo(askIfExists);

  return getBooleanSparqlResult(result);
}
