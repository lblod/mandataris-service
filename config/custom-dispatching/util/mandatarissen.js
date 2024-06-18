async function getDifferenceBetweenSources(triples, target) {
  const mappedTriples = triples.map((triple) => {
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
  console.log(`|> QUERY  FOR DIFFERENCES:\n`, query);
}

module.exports = {
  getDifferenceBetweenSources,
};
