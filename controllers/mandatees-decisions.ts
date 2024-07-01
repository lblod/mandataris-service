import { findBestuurseenheidForMandaat } from '../data-access/bestuurseenheid';
import {
  findStartDateOfMandataris as findStartDateOfMandataris,
  terminateMandataris,
} from '../data-access/mandataris';
import {
  findPersoonForMandatarisInGraph,
  getMandateOfMandataris as findMandateOfMandataris,
  getQuadsInLmbFromTriples,
  findOverlappingMandataris,
  insertTriplesInGraph,
  isMandatarisInTarget as isMandatarisInLmbDatabase,
  updateDifferencesOfMandataris,
  getTriplesOfSubject,
  TERM_STAGING_GRAPH,
} from '../data-access/mandatees-decisions';
import { Term } from '../types';

export async function handleTriplesForMandatarisSubjects(
  mandatarisSubjects: Array<Term>,
) {
  console.log(
    `|> Handle Triples For Mandataris Subjects (${mandatarisSubjects.length})`,
  );

  for (const mandatarisSubject of mandatarisSubjects) {
    console.log(`|> Mandataris uri: ${mandatarisSubject.value}`);
    const isExitingInLmbDatabase =
      await isMandatarisInLmbDatabase(mandatarisSubject);
    console.log(
      `|> Mandataris exists in LMB database? ${isExitingInLmbDatabase}`,
    );

    const mandaat = await findMandateOfMandataris(mandatarisSubject);
    console.log('|> Mandaat for mandataris', mandaat);
    if (!mandaat) {
      console.log(
        `|> No mandaat found for mandataris with subject: ${mandatarisSubject.value} \n|>\n`,
      );
      continue;
    }

    const mandatarisGraph = await findBestuurseenheidForMandaat(mandaat);
    console.log(`|> mandataris graph: ${mandatarisGraph?.value ?? undefined}.`);

    if (!mandatarisGraph) {
      console.log(
        `|> Could not find graph from mandaat: ${mandaat.value}. Continueing to the next subject.\n|>\n`,
      );
      continue;
    }

    const incomingTriples = await getTriplesOfSubject(
      mandatarisSubject,
      TERM_STAGING_GRAPH,
    );
    console.log(
      `|> Found ${incomingTriples.length} in the staging graph for mandataris.`,
    );
    if (isExitingInLmbDatabase) {
      const currentQuads = await getQuadsInLmbFromTriples(incomingTriples);
      console.log('|> Updating mandataris predicate values.');
      await updateDifferencesOfMandataris(
        currentQuads,
        incomingTriples,
        mandatarisGraph,
      );

      console.log(
        '|> Going to the next mandataris subeject as triples are updated. \n|>\n',
      );
      continue;
    }

    // Looking for persoon in graph of the mandataris
    const persoonOfMandataris = await findPersoonForMandatarisInGraph(
      mandatarisSubject,
      mandatarisGraph,
    );
    console.log(
      `|> Persoon from mandataris: ${persoonOfMandataris?.value ?? undefined}.`,
    );

    if (persoonOfMandataris) {
      const overlappingMandataris = await findOverlappingMandataris(
        persoonOfMandataris,
        mandaat,
      );
      console.log(
        `|> Persoon has overlapping mandaat? ${
          overlappingMandataris?.value ?? false
        }`,
      );

      if (overlappingMandataris) {
        const startDate = await findStartDateOfMandataris(mandatarisSubject);
        console.log(
          `|> Found start date for incoming mandataris? ${startDate}`,
        );
        if (startDate) {
          await terminateMandataris(overlappingMandataris, startDate);
        }
      }

      console.log('|> Inserting incoming triples');
      await insertTriplesInGraph(incomingTriples, mandatarisGraph);
    } else {
      // TODO: LMB-520
      console.log('|> Persoon does not exist: TODO in LMB-520');
    }
    console.log(
      `|> End of logic for mandataris subject: ${mandatarisSubject.value} \n|>\n`,
    );
  }
}
