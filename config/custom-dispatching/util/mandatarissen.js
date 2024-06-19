const { INGEST_GRAPH } = require('../config');

async function getDifferenceBetweenSources(triples, target, typeUri, lib) {
  const { muAuthSudo, sparqlEscapeUri } = lib;
  const uniqueSubjects = Array.from(new Set(triples.map((t) => t.subject)));
  const subjectsOfTypeQuery = `
    SELECT ?subject 
      WHERE {
        GRAPH ${sparqlEscapeUri(INGEST_GRAPH)} {
          VALUES ?subject {
            ${uniqueSubjects.join('\n')}
          }
          ?subject a ${sparqlEscapeUri(typeUri)}.
      }
    }
  `;
  const subjectsOfType = await muAuthSudo.updateSudo(
    subjectsOfTypeQuery,
    {},
    { sparqlEndpoint: target },
  );
  if (subjectsOfType.results.bindings.length === 0) {
    console.log(`|> No subjects for type <${typeUri}> found \n`);
    return;
  }

  const mappedResult = subjectsOfType.results.bindings.map((binding) =>
    sparqlEscapeUri(binding['subject'].value),
  );
  const filteredTriplesOfType = triples.filter((triple) =>
    mappedResult.includes(triple.subject),
  );
  const mappedTriples = filteredTriplesOfType.map((triple) => {
    return `(${triple.subject} ${triple.predicate}) \n`;
  });
  const query = `
    SELECT ?subject ?predicate ?object
    WHERE {
      VALUES (?subject ?predicate) {
        ${mappedTriples.join('')}
      }
      ?subject ?predicate ?object .
    }
  `;
  const resultsInTarget = await muAuthSudo.updateSudo(
    query,
    {},
    { sparqlEndpoint: target },
  );
  const mappedResultsInTarget = resultsInTarget.results.bindings.map(
    (binding) => {
      return {
        subject: binding['subject'].value,
        predicate: binding['predicate'].value,
        object: binding['object'].value,
      };
    },
  );
  console.log(`|> Incoming values: ${JSON.stringify(filteredTriplesOfType)}\n`);
  console.log(`|> Target values: ${JSON.stringify(mappedResultsInTarget)}\n`);
  console.log('|> --------------------------');
}

module.exports = {
  getDifferenceBetweenSources,
};
