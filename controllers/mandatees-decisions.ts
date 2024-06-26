import {
  TERM_MANDATARIS_TYPE,
  findGraphOfType,
  findPersoonForMandataris,
  getMandateOfMandataris,
  getSubjectsOfType,
  getValuesForSubjectPredicateInTarget,
  hasOverlappingMandaat,
  insertQuadsInGraph,
  isMandatarisInTarget,
  updateDifferencesOfMandataris,
} from '../data-access/mandatees-decisions';
import { Changeset, Quad } from '../util/types';

export async function getDifferencesForTriples(changeSets: Array<Changeset>) {
  console.log('|> process deltas');
  const insertsOfChangeSets = changeSets
    .map((changeSet: Changeset) => changeSet.inserts)
    .flat();
  const mandatarisSubjects = await getSubjectsOfType(
    TERM_MANDATARIS_TYPE,
    insertsOfChangeSets,
  );

  // This throws a hard error when no graph is found! + THIS IS INCORRECT
  const mandatarisGraph = await findGraphOfType(TERM_MANDATARIS_TYPE);
  console.log(`|> Found ${mandatarisSubjects.length} mandataris subjects.`);
  for (const mandatarisSubject of mandatarisSubjects) {
    const incomingQuadsForSubject = insertsOfChangeSets.filter(
      (quad: Quad) => mandatarisSubject.value === quad.subject.value,
    );
    const isExistingInTarget = await isMandatarisInTarget(mandatarisSubject);
    if (isExistingInTarget) {
      const currentQuads = await getValuesForSubjectPredicateInTarget(
        incomingQuadsForSubject,
      );
      console.log('|> Mandataris exists in LMB. updating predicate values.');
      await updateDifferencesOfMandataris(
        currentQuads,
        incomingQuadsForSubject,
        mandatarisGraph,
      );
    }

    // Looking for persoon in every graph!
    const persoonOfMandataris =
      await findPersoonForMandataris(mandatarisSubject);

    if (!persoonOfMandataris) {
      // TODO: LMB-520
    } else {
      console.log(`|> Person (${persoonOfMandataris.value}) found.`);
      const mandaat = await getMandateOfMandataris(mandatarisSubject);
      const persoonHasOverlappingMandaat = await hasOverlappingMandaat(
        persoonOfMandataris,
        mandaat,
      );

      if (!persoonHasOverlappingMandaat) {
        console.log('|> No overlap with mandaat. Inserting triples.');
        await insertQuadsInGraph(incomingQuadsForSubject, mandatarisGraph);
      } else {
        console.log(
          '|> Persoon Has Overlapping WithMandaat',
          persoonHasOverlappingMandaat,
        );
      }
    }
  }
}
