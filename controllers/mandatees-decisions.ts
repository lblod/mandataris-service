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
import { Changeset, Quad } from '../util/types';

export async function handleDeltaChangeset(changeSets: Array<Changeset>) {
  console.log('|> Handle delta changeset');
  const insertsOfChangeSets = changeSets
    .map((changeSet: Changeset) => changeSet.inserts)
    .flat();
  const mandatarisSubjects = await getSubjectsOfType(
    TERM_MANDATARIS_TYPE,
    insertsOfChangeSets,
  );

  console.log(`|> Found ${mandatarisSubjects.length} mandataris subjects.`);
  for (const mandatarisSubject of mandatarisSubjects) {
    console.log('|> \t Start new loop', mandatarisSubject.value);
    const incomingQuadsForSubject = insertsOfChangeSets.filter(
      (quad: Quad) => mandatarisSubject.value === quad.subject.value,
    );
    const isExistingInTarget = await isMandatarisInTarget(mandatarisSubject);
    console.log(`|> Mandataris exists in LMB database? ${isExistingInTarget}`);
    if (isExistingInTarget) {
      const currentQuads = await getValuesForSubjectPredicateInTarget(
        incomingQuadsForSubject,
      );
      console.log('|> Updating mandataris predicate values.');
      await updateDifferencesOfMandataris(
        currentQuads,
        incomingQuadsForSubject,
      );
    }

    // Looking for persoon in every graph!
    const persoonOfMandataris =
      await findPersoonForMandataris(mandatarisSubject);
    console.log(
      `|> Persoon from mandataris: ${persoonOfMandataris?.value ?? undefined}.`,
    );
    const mandaat = await findMandateOfMandataris(mandatarisSubject);

    if (!mandaat) {
      console.log(
        `|> No mandaat found for mandataris with subject: ${mandatarisSubject.value}`,
      );
      continue;
    }

    if (persoonOfMandataris) {
      const overlappingMandataris = await findOverlappingMandataris(
        persoonOfMandataris,
        mandaat,
      );
      console.log(
        `|> persoon has overlapping mandaat? ${
          overlappingMandataris?.subject.value ?? false
        }`,
      );

      if (overlappingMandataris) {
        const startDate = await findStartDateOfMandataris(mandatarisSubject);
        console.log(
          `|> Found start date for incoming mandataris? ${
            startDate?.value ?? null
          }`,
        );
        if (startDate) {
          await terminateMandataris(overlappingMandataris.subject, startDate);
        }
      }

      const mandatarisGraph = await findBestuurseenheidForMandaat(mandaat);
      if (!mandatarisGraph) {
        throw Error(
          `Could not find graph for mandataris. Not inserting incoming triples: ${JSON.stringify(
            incomingQuadsForSubject,
          )}`,
        );
      } else {
        await insertQuadsInGraph(incomingQuadsForSubject, mandatarisGraph);
      }

      console.log(
        `|> End of logic for mandataris subject: ${mandatarisSubject.value} \n\n`,
      );
    } else {
      // TODO: LMB-520
    }
  }
}
