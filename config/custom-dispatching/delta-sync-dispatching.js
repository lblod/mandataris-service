const { getDifferenceBetweenSources } = require('./util/mandatarissen');
const { parallelisedBatchedUpdate } = require('./util/batch-update');
const {
  DIRECT_DATABASE_ENDPOINT,
  PARALLEL_CALLS,
  BATCH_SIZE,
  SLEEP_BETWEEN_BATCHES,
  INGEST_GRAPH,
  BYPASS_MU_AUTH_FOR_EXPENSIVE_QUERIES,
} = require('./config');

/**
 * Dispatch the fetched information to a target graph.
 * @param { mu, muAuthSudo, fetch } lib - The provided libraries from the host service.
 * @param { termObjectChangeSets: { deletes, inserts } } data - The fetched changes sets, which objects of serialized Terms
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
  const { termObjectChangeSets } = data;
  console.log(`|> DELTA SYNC`);

  for (let { deletes, inserts } of termObjectChangeSets) {
    const deleteStatements = deletes.map(
      (o) => `${o.subject} ${o.predicate} ${o.object}.`,
    );
    await parallelisedBatchedUpdate(
      lib,
      deleteStatements,
      INGEST_GRAPH,
      SLEEP_BETWEEN_BATCHES,
      BATCH_SIZE,
      {},
      DIRECT_DATABASE_ENDPOINT,
      'DELETE',
      //If we don't bypass mu-auth already from the start, we provide a direct database endpoint
      // as fallback
      !BYPASS_MU_AUTH_FOR_EXPENSIVE_QUERIES ? DIRECT_DATABASE_ENDPOINT : '',
      PARALLEL_CALLS,
    );

    const insertStatements = inserts.map(
      (o) => `${o.subject} ${o.predicate} ${o.object}.`,
    );
    await parallelisedBatchedUpdate(
      lib,
      insertStatements,
      INGEST_GRAPH,
      SLEEP_BETWEEN_BATCHES,
      BATCH_SIZE,
      {},
      DIRECT_DATABASE_ENDPOINT,
      'INSERT',
      //If we don't bypass mu-auth already from the start, we provide a direct database endpoint
      // as fallback
      !BYPASS_MU_AUTH_FOR_EXPENSIVE_QUERIES ? DIRECT_DATABASE_ENDPOINT : '',
      PARALLEL_CALLS,
    );

    await getDifferenceBetweenSources(
      inserts,
      DIRECT_DATABASE_ENDPOINT,
      'http://data.vlaanderen.be/ns/mandaat#Mandataris',
      lib,
    );
  }
}

module.exports = {
  dispatch,
};
