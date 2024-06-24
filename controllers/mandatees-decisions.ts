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
}
