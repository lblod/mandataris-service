function updateDifferences(incomingTriples, currentTriples) {
  console.log(`|> updateDifferences START`);
  matchTriplesToCurrentAndIncoming(incomingTriples, currentTriples);
  console.log(`|> updateDifferences DONE`);
  console.log('|> --------------------------');
}

function matchTriplesToCurrentAndIncoming(incomingTriples, currentTriples) {
  for (const incomingTriple of incomingTriples) {
    const foundInCurrent = currentTriples.find(
      (triple) =>
        triple.subject == incomingTriple.subject &&
        triple.predicate == incomingTriple.predicate,
    );

    if (!foundInCurrent) {
      console.log(
        `|> Predicate ${incomingTriple.predicate} is missing in current triples for subject: ${incomingTriple.subject}`,
      );
    }

    if (foundInCurrent.object !== incomingTriple.object) {
      console.log(
        `|> We a found a difference in value for predicate: ${incomingTriple.predicate}: \n \t old value = ${foundInCurrent.object} \n \t new value = ${incomingTriple.object}`,
      );
    }

    console.log(
      `|> No Difference between incoming an current data for predicate ${incomingTriple.predicate}`,
    );
  }
  console.log(`|> Matched triples with current and incoming`);
  console.log('|> --------------------------');
}

module.exports = {
  updateDifferences,
};
