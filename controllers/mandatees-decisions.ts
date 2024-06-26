import {
  MANDATARIS_TYPE_URI,
  findGraphOfType,
  findPersoonForMandataris,
  getMandateOfMandataris,
  getSubjectsOfType,
  getValuesForSubjectPredicateInTarget,
  hasOverlappingMandaat,
  isMandatarisInTarget,
  updateDifferencesOfMandataris,
} from '../data-access/mandatees-decisions';
import { Changeset, Quad } from '../util/types';

export async function getDifferencesForTriples(changeSets: Array<Changeset>) {
  const insertsOfChangeSets = changeSets
    .map((changeSet: Changeset) => changeSet.inserts)
    .flat();
  const mandatarisSubjects = await getSubjectsOfType(
    MANDATARIS_TYPE_URI,
    insertsOfChangeSets,
  );

  for (const mandatarisUri of mandatarisSubjects) {
    const incomingQuadsForSubject = insertsOfChangeSets.filter(
      (quad: Quad) => mandatarisUri === quad.subject.value,
    );
    const isExistingInTarget = await isMandatarisInTarget(mandatarisUri);
    if (isExistingInTarget) {
      const currentQuads = await getValuesForSubjectPredicateInTarget(
        incomingQuadsForSubject,
      );

      // This throws a hard error when no graph is found!
      const mandatarisGraph = await findGraphOfType(mandatarisUri);

      await updateDifferencesOfMandataris(
        currentQuads,
        incomingQuadsForSubject,
        mandatarisGraph,
      );
    }

    // Looking for persoon in every graph!
    const persoonUriOfMandataris =
      await findPersoonForMandataris(mandatarisUri);
    console.log('|> persoonOfMandataris', persoonUriOfMandataris);

    if (!persoonUriOfMandataris) {
      // TODO: LMB-520
    } else {
      const mandaatUri = await getMandateOfMandataris(mandatarisUri);
      const persoonHasOverlappingMandaat = await hasOverlappingMandaat(
        persoonUriOfMandataris,
        mandaatUri,
      );
      console.log(
        '|> persoonHasOverlappingMandaat',
        persoonHasOverlappingMandaat,
      );
    }
  }
}
