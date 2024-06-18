const { getDifferenceBetweenSources } = require('./util/mandatarissen');
const { DIRECT_DATABASE_ENDPOINT } = require('./config');

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
  console.log(
    `|> Found an amount of ${termObjectChangeSets.length} changesets`,
  );
  for (let { deletes, inserts } of termObjectChangeSets) {
    console.log('Logging delete information: ');
    const deleteStatements = deletes.map(
      (o) =>
        `In graph: ${o.graph}, triple: ${o.subject} ${o.predicate} ${o.object}`,
    );
    deleteStatements.forEach((s) => console.log(s));

    console.log('Logging insert information: ');
    const insertStatements = inserts.map(
      (o) =>
        `In graph: ${o.graph}, triple: ${o.subject} ${o.predicate} ${o.object}.`,
    );
    insertStatements.forEach((s) => console.log(s));
    await getDifferenceBetweenSources(inserts, DIRECT_DATABASE_ENDPOINT);
  }
}

module.exports = {
  dispatch,
};
