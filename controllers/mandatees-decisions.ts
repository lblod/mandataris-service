import {
  getSubjectsOfType,
  getValuesForSubjectPredicateInTarget,
} from '../data-access/mandatees-decisions';
import { Changeset, Quad } from '../util/types';

export async function getDifferencesForTriples(changeSets: Array<Changeset>) {
  const insertsOfChangeSets = changeSets
    .map((changeSet: Changeset) => changeSet.inserts)
    .flat();
  const subjects = await getSubjectsOfType(
    'http://data.vlaanderen.be/ns/mandaat#Mandataris',
    insertsOfChangeSets,
  );

  const quadsForSubjects = insertsOfChangeSets.filter((quad: Quad) =>
    subjects.includes(quad.subject.value),
  );

  const quadsInTarget =
    await getValuesForSubjectPredicateInTarget(quadsForSubjects);

  console.log('|> Incoming quads:', quadsForSubjects.length);
  console.log(
    '|> Target values for subject and predicate:',
    quadsInTarget.length,
  );
  matchConsumedWithTargetQuads(quadsForSubjects, quadsInTarget);
}

function matchConsumedWithTargetQuads(
  consumedQuads: Array<Quad>,
  quadsInTarget: Array<Quad>,
): void {
  if (quadsInTarget.length === 0) {
    console.log('|> None of the quads exist in the target');
    return;
  }

  for (const consumed of consumedQuads) {
    const foundInCurrent = quadsInTarget.find(
      (quad: Quad) =>
        quad.subject.value == consumed.subject.value &&
        quad.predicate.value == consumed.predicate.value,
    );

    if (!foundInCurrent) {
      console.log(
        `|> Predicate ${consumed.predicate.value} is missing in current quads for subject: ${consumed.subject.value}`,
      );
      return;
    }

    if (foundInCurrent.object.value !== consumed.object.value) {
      console.log(
        `|> We a found a difference in value for predicate: ${consumed.predicate.value}: \n \t old value = ${foundInCurrent.object.value} \n \t new value = ${consumed.object.value}`,
      );
    }

    console.log(
      `|> No Difference between incoming an current data for predicate ${consumed.predicate.value}`,
    );
  }
  console.log('|> Matched triples with current and incoming');
  console.log('|> --------------------------');
}
