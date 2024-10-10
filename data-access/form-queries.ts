import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { sparqlEscapeDateTime, sparqlEscapeString } from '../util/mu';
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

  const result = findFirstSparqlResult(queryResult);
  return result?.user.value;
};

export const saveHistoryItem = async (
  instanceUri: string,
  creatorUri: string,
  description?: string,
) => {
  const historyGraph = `<http://mu.semte.ch/graphs/formHistory/${uuid()}>`;

  let descriptionInsert = '';
  if (description && description.trim().length > 0) {
    descriptionInsert = `; dct:description ${sparqlEscapeString(description)} `;
  }

  const insertQuery = `
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    INSERT {
      GRAPH <http://mu.semte.ch/graphs/formHistory> {
        ${historyGraph} a <http://mu.semte.ch/vocabularies/ext/FormHistory> ;
          dct:isVersionOf ${sparqlEscapeUri(instanceUri)} ;
          dct:issued ${sparqlEscapeDateTime(new Date())} ;
          dct:creator ${sparqlEscapeUri(creatorUri)} ${descriptionInsert}.
      }
      GRAPH ${historyGraph} {
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
