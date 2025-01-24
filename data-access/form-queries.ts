import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, sparqlEscapeDateTime, sparqlEscapeString } from 'mu';
import { v4 as uuid } from 'uuid';
import { findFirstSparqlResult } from '../util/sparql-result';

export const fetchUserIdFromSession = async (sessionUri: string) => {
  const queryResult = await querySudo(`
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT ?user
    WHERE {
      ${sparqlEscapeUri(sessionUri)} session:account ?account.
      ?user foaf:account ?account.
    } LIMIT 1
  `);

  return findFirstSparqlResult(queryResult)?.user.value;
};

export const saveHistoryItem = async (
  instanceUri: string,
  creatorUri: string,
  description?: string,
) => {
  const historyGraphUri = sparqlEscapeUri(
    `http://mu.semte.ch/graphs/formHistory/${uuid()}`,
  );

  let descriptionInsert = '';
  if (description && description.trim().length > 0) {
    descriptionInsert = `; dct:description ${sparqlEscapeString(description)} `;
  }

  const insertQuery = `
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    INSERT {
      GRAPH <http://mu.semte.ch/graphs/formHistory> {
        ${historyGraphUri} a <http://mu.semte.ch/vocabularies/ext/FormHistory> ;
          dct:isVersionOf ${sparqlEscapeUri(instanceUri)} ;
          dct:issued ${sparqlEscapeDateTime(new Date())} ;
          dct:creator ${sparqlEscapeUri(creatorUri)} ${descriptionInsert}.
      }
      GRAPH ${historyGraphUri} {
        ${sparqlEscapeUri(instanceUri)} ?p ?o.
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(instanceUri)} ?p ?o.
      }
      FILTER (?p NOT IN (dct:modified))
    }
  `;

  await updateSudo(insertQuery);
};
export const saveBulkHistoryItem = async (
  instanceUris: Array<string>,
  creatorUri: string,
  description?: string,
) => {
  const instanceValues = instanceUris
    .map((uri) => {
      const historyGraphUri = `<http://mu.semte.ch/graphs/formHistory/${uuid()}>`;

      return `( ${sparqlEscapeUri(uri)} ${historyGraphUri} )`;
    })
    .join('\n');

  let descriptionInsert = '';
  if (description && description.trim().length > 0) {
    descriptionInsert = `; dct:description ${sparqlEscapeString(description)} `;
  }

  const insertQuery = `
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    INSERT {
      GRAPH <http://mu.semte.ch/graphs/formHistory> {
        ?historyGraph a <http://mu.semte.ch/vocabularies/ext/FormHistory> ;
          dct:isVersionOf ?instanceUri ;
          dct:issued ${sparqlEscapeDateTime(new Date())} ;
          dct:creator ${sparqlEscapeUri(creatorUri)} ${descriptionInsert}.
      }
      GRAPH ?historyGraph {
        ?instanceUri ?p ?o.
      }
    }
    WHERE {
      VALUES (?instanceUri ?historyGraph) { ${instanceValues} }
      GRAPH ?g {
        ?instanceUri ?p ?o.
      }
      FILTER (?p NOT IN (dct:modified))
    }
  `;

  await updateSudo(insertQuery);
};
