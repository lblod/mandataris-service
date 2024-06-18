const { getDifferenceBetweenSources } = require('./util/mandatarissen');
const { DIRECT_DATABASE_ENDPOINT } = require('./config');

/**
 * Dispatch the fetched information to a target graph.
 * @param { mu, muAuthSudo, fech } lib - The provided libraries from the host service.
 * @param { termObjects } data - The fetched quad information, which objects of serialized Terms
 *          [ {
 *              graph: "<http://foo>",
 *              subject: "<http://bar>",
 *              predicate: "<http://baz>",
 *              object: "<http://boom>^^<http://datatype>"
 *            }
 *         ]
 * @return {void} Nothing
 */
async function dispatch(lib, data) {
  const triples = data.termObjects;
  console.log(`|> INITAL SYNC`);
  console.log(`|> Found ${triples.length} to be processed`);
  console.log('Showing only the first 10.');
  const info = triples
    .slice(0, 10)
    .map((t) => `triple: ${t.subject} ${t.predicate} ${t.object}`);
  info.forEach((s) => console.log(s));
  await getDifferenceBetweenSources(triples, DIRECT_DATABASE_ENDPOINT);

  console.log('All triples were logged');
}

/**
 * A callback you can override to do extra manipulations
 *   after initial ingest.
 * @param { mu, muAuthSudo, fech } lib - The provided libraries from the host service.
 * @return {void} Nothing
 */
async function onFinishInitialIngest(_lib) {
  console.log(`
    onFinishInitialIngest was called!
    Current implementation does nothing, no worries.
    You can overrule it for extra manipulations after initial ingest.
  `);
}

module.exports = {
  dispatch,
  onFinishInitialIngest,
};
