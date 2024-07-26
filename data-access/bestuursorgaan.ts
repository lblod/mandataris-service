import { getBooleanSparqlResult } from '../util/sparql-result';
import { sparqlEscapeUri } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';

export const bestuursorgaan = {
  allExist,
};

async function allExist(
  bestuursorgaanUrisInTijd: Array<string>,
): Promise<boolean> {
  const escapedUris = bestuursorgaanUrisInTijd.map((boit) =>
    sparqlEscapeUri(boit),
  );
  // TODO: this is false just checks one uri
  const askIfExists = `
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

      ASK {
        GRAPH ?bestuursorgaanGraph {
          VALUES ?possibleBestuurorgaan { ${escapedUris.join(' ')} }.
          ?possibleBestuurorgaan a besluit:Bestuursorgaan.
        }
        FILTER ( ?bestuursorgaanGraph != <http://mu.semte.ch/vocabularies/ext/FormHistory>)
      }
    `;

  const result = await querySudo(askIfExists);

  return getBooleanSparqlResult(result);
}
