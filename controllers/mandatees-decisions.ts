import { findBestuurseenheidForMandaat } from '../data-access/bestuurseenheid';
import {
  findStartDateOfMandataris as findStartDateOfMandataris,
  terminateMandataris,
} from '../data-access/mandataris';
import {
  TERM_MANDATARIS_TYPE,
  findPersoonForMandataris,
  getMandateOfMandataris as findMandateOfMandataris,
  getSubjectsOfType,
  getValuesForSubjectPredicateInTarget,
  findOverlappingMandataris,
  insertQuadsInGraph,
  isMandatarisInTarget,
  updateDifferencesOfMandataris,
} from '../data-access/mandatees-decisions';
import { Changeset, Quad } from '../types';

export async function handleDeltaChangeset(changeSets: Array<Changeset>) {
  console.log('|> 1. Handle delta changeset');
  const insertsOfChangeSets = changeSets
    .map((changeSet: Changeset) => changeSet.inserts)
    .flat();
  const mandatarisSubjects = await getSubjectsOfType(
    TERM_MANDATARIS_TYPE,
    insertsOfChangeSets,
  );

  console.log(
    `|> 2.Found ${mandatarisSubjects.length} unique mandataris subjects.`,
  );
  for (const mandatarisSubject of mandatarisSubjects) {
    console.log('|> \t 3.1 Start new loop', mandatarisSubject.value);
    const incomingQuadsForSubject = insertsOfChangeSets.filter(
      (quad: Quad) => mandatarisSubject.value === quad.subject.value,
    );
    const isExistingInTarget = await isMandatarisInTarget(mandatarisSubject);
    console.log(
      `|> 3.2 Mandataris exists in LMB database? ${isExistingInTarget}`,
    );
    if (isExistingInTarget) {
      const currentQuads = await getValuesForSubjectPredicateInTarget(
        incomingQuadsForSubject,
      );
      console.log('|> 3.3 Updating mandataris predicate values.');
      await updateDifferencesOfMandataris(
        currentQuads,
        incomingQuadsForSubject,
      );

      console.log(
        '|> 3.4 Going to the next mandataris subeject as triples are updated.',
      );
      continue;
    }

    // Looking for persoon in every graph!
    const persoonOfMandataris =
      await findPersoonForMandataris(mandatarisSubject);
    console.log(
      `|> 4 Persoon from mandataris: ${
        persoonOfMandataris?.value ?? undefined
      }.`,
    );
    const mandaat = await findMandateOfMandataris(mandatarisSubject);
    console.log('|> 5 Mandaat for mandataris', mandaat);
    if (!mandaat) {
      console.log(
        `|> 5.2 No mandaat found for mandataris with subject: ${mandatarisSubject.value}`,
      );
      continue;
    }

    if (persoonOfMandataris) {
      const overlappingMandataris = await findOverlappingMandataris(
        persoonOfMandataris,
        mandaat,
      );
      console.log(
        `|> 6.1 persoon has overlapping mandaat? ${
          overlappingMandataris?.subject.value ?? false
        }`,
      );

      if (overlappingMandataris) {
        const startDate = await findStartDateOfMandataris(mandatarisSubject);
        console.log(
          `|> 6.2 Found start date for incoming mandataris? ${startDate}`,
        );
        if (startDate) {
          await terminateMandataris(overlappingMandataris.subject, startDate);
        }
      }

      const mandatarisGraph = await findBestuurseenheidForMandaat(mandaat);
      console.log(
        `|> 6.3 mandataris graph: ${mandatarisGraph?.value ?? undefined}.`,
      );
      if (!mandatarisGraph) {
        throw Error(
          `Could not find graph for mandataris. Not inserting incoming triples: ${JSON.stringify(
            incomingQuadsForSubject,
          )}`,
        );
      } else {
        console.log('|> 6.4 inserting incoming triples');
        await insertQuadsInGraph(incomingQuadsForSubject, mandatarisGraph);
      }
    } else {
      // TODO: LMB-520
      console.log('|> 6.1 Persoon does not exist: TODO in LMB-520');
    }
    console.log(
      `|> End of logic for mandataris subject: ${mandatarisSubject.value} \n\n`,
    );
  }
}
