import { query, sparqlEscapeString } from 'mu';

export const codelijstRepository = {
  findConceptImplementation,
};

async function findConceptImplementation(conceptId: string) {
  const queryResult = await query(`
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?s
    WHERE {
      ?s a ?type .
      ?s ?p ${sparqlEscapeString(conceptId)} .

      FILTER(?type != skos:Concept)
    } LIMIT 1
  `);

  return queryResult.results.bindings.length >= 1;
}
