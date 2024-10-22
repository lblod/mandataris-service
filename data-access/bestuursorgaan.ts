import { sparqlEscapeString, query } from 'mu';
import { getBooleanSparqlResult } from '../util/sparql-result';

export const bestuursorgaan = {
  isValidId,
};

async function isValidId(id: string): Promise<boolean> {
  const askQuery = `
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    ASK {
      ?bestuursperiode a besluit:Bestuursorgaan;
        mu:uuid ${sparqlEscapeString(id)}.
    }
  `;
  const sparqlResult = await query(askQuery);

  return getBooleanSparqlResult(sparqlResult);
}
