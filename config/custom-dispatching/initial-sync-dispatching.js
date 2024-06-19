const { getDifferenceBetweenSources } = require('./util/mandatarissen');
const { parallelisedBatchedUpdate } = require('./util/batch-update');
const {
  DIRECT_DATABASE_ENDPOINT,
  MU_CALL_SCOPE_ID_INITIAL_SYNC,
  INGEST_GRAPH,
  SLEEP_BETWEEN_BATCHES,
  BATCH_SIZE,
  PARALLEL_CALLS,
  BYPASS_MU_AUTH_FOR_EXPENSIVE_QUERIES,
} = require('./config');

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
  console.log(`|> INITAL SYNC`);

  const triples = data.termObjects;
  await parallelisedBatchedUpdate(
    lib,
    triples,
    INGEST_GRAPH,
    SLEEP_BETWEEN_BATCHES,
    BATCH_SIZE,
    { 'mu-call-scope-id': MU_CALL_SCOPE_ID_INITIAL_SYNC },
    DIRECT_DATABASE_ENDPOINT,
    'INSERT',
    //If we don't bypass mu-auth already from the start, we provide a direct database endpoint
    // as fallback
    !BYPASS_MU_AUTH_FOR_EXPENSIVE_QUERIES ? DIRECT_DATABASE_ENDPOINT : '',
    PARALLEL_CALLS,
  );

  await getDifferenceBetweenSources(
    triples,
    DIRECT_DATABASE_ENDPOINT,
    'http://data.vlaanderen.be/ns/mandaat#Mandataris',
    lib,
  );
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
