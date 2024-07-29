import { getBooleanSparqlResult } from '../util/sparql-result';
import { sparqlEscapeUri, query } from 'mu';

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

  const result = await query(askIfExists);

  return getBooleanSparqlResult(result);
}
