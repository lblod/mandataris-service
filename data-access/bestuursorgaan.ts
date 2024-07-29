import { getBooleanSparqlResult } from '../util/sparql-result';
import { sparqlEscapeUri } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';

export const bestuursorgaan = {
  exists,
};

async function exists(bestuursorgaanUriInTijd: string): Promise<boolean> {
  const askIfExists = `
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

      ASK {
        GRAPH ?bestuursorgaanGraph {
          ${sparqlEscapeUri(bestuursorgaanUriInTijd)} a besluit:Bestuursorgaan.
        }
      }
    `;

  const result = await querySudo(askIfExists);

  return getBooleanSparqlResult(result);
}
