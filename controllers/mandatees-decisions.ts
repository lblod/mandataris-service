import { findBestuurseenheidForMandaat } from '../data-access/bestuurseenheid';

import {
  endExistingMandataris,
  findDecisionForMandataris,
  findStartDateOfMandataris as findStartDateOfMandataris,
  updatePublicationStatusOfMandataris,
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
  findNameOfPersoonFromStaging,
  isSubjectOfType,
  TERM_MANDATARIS_TYPE,
} from '../data-access/mandatees-decisions';
import {
  checkPersonExistsAllGraphs,
  copyPerson,
  createrPersonFromUri,
} from '../data-access/persoon';
import { mandatarisQueue } from '../routes/delta';
import { Term } from '../types';
import { PUBLICATION_STATUS } from '../util/constants';

export async function processMandatarisForDecisions(
  mandatarisSubject: Term,
): Promise<void> {
  const isMandataris = await isSubjectOfType(
    TERM_MANDATARIS_TYPE,
    mandatarisSubject,
  );
  if (!isMandataris) {
    console.log(
      `|> URI: ${mandatarisSubject.value} is not of type: ${TERM_MANDATARIS_TYPE.value}`,
    );
    return;
  }

  // The decision is actually a besluit:Artikel this
  // because the besluit does not have a direct relation to the mandataris yet
  const decision = await findDecisionForMandataris(mandatarisSubject);
  if (!decision) {
    console.log(
      `|> Could not find a decision for mandataris: ${mandatarisSubject.value}`,
    );
    mandatarisQueue.addToManualQueue(mandatarisSubject);
    return;
  }

  await handleTriplesForMandatarisSubject(mandatarisSubject);
  await updatePublicationStatusOfMandataris(
    mandatarisSubject,
    PUBLICATION_STATUS.BEKRACHTIGD,
  );
}

export async function handleTriplesForMandatarisSubject(
  mandatarisSubject: Term,
) {
  console.log(`|> Mandataris uri: ${mandatarisSubject.value}`);
  const isExitingInLmbDatabase =
    await isMandatarisInLmbDatabase(mandatarisSubject);
  console.log(
    `|> Mandataris exists in LMB database? ${isExitingInLmbDatabase}`,
  );

  const mandaat = await findMandateOfMandataris(mandatarisSubject);
  console.log('|> Mandaat for mandataris', mandaat?.value);
  if (!mandaat) {
    console.log(
      `|> No mandaat found for mandataris with subject: ${mandatarisSubject.value} \n|>\n`,
    );
    mandatarisQueue.addToManualQueue(mandatarisSubject);
    return;
  }

  const mandatarisGraph = await findBestuurseenheidForMandaat(mandaat);
  console.log(`|> mandataris graph: ${mandatarisGraph?.value ?? undefined}.`);

  if (!mandatarisGraph) {
    console.log(
      `|> Could not find graph from mandaat: ${mandaat.value}. Continueing to the next subject.\n|>\n`,
    );
    mandatarisQueue.addToManualQueue(mandatarisSubject);
    return;
  }

  const incomingTriples = await getTriplesOfSubject(
    mandatarisSubject,
    TERM_STAGING_GRAPH,
  );
  console.log(
    `|> Found ${incomingTriples.length} triples in the staging graph for mandataris.`,
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
    return;
  }

  // Looking for persoon in graph of the mandataris
  const persoonOfMandataris = await findPersoonForMandatarisInGraph(
    mandatarisSubject,
    TERM_STAGING_GRAPH,
  );

  if (!persoonOfMandataris) {
    console.log(
      `|> Could not find person of mandataris: ${mandatarisSubject.value}. Continuing to the next subject.\n|>\n`,
    );
    mandatarisQueue.addToManualQueue(mandatarisSubject);
    return;
  }

  console.log(
    `|> Persoon from mandataris: ${persoonOfMandataris?.value ?? undefined}.`,
  );

  const persoonInLMBGraph = await findPersoonForMandatarisInGraph(
    mandatarisSubject,
    mandatarisGraph,
  );
  console.log(
    `|> Is persoon in graph of mandataris (LMB)? ${
      persoonInLMBGraph ? true : false
    }`,
  );
  if (persoonInLMBGraph) {
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
      console.log(`|> Found start date for incoming mandataris? ${startDate}`);
      if (startDate) {
        await endExistingMandataris(
          mandatarisGraph,
          overlappingMandataris,
          startDate,
        );
      }
    }

    console.log('|> Inserting incoming triples');
    await insertTriplesInGraph(incomingTriples, mandatarisGraph);

    return;
  }

  // If person exists in another graph, copy that person.
  const personInOtherGraph =
    await checkPersonExistsAllGraphs(persoonOfMandataris);
  console.log(
    `|> Is persoon in other graphs of the LMB application?: ${personInOtherGraph}`,
  );
  if (personInOtherGraph) {
    await copyPerson(persoonOfMandataris, mandatarisGraph);
    return;
  }

  // Create new person with given firstname and lastname
  const persoon = await findNameOfPersoonFromStaging(mandatarisSubject);
  console.log('|> Looking for persoon names', persoon);
  if (!persoon) {
    mandatarisQueue.addToManualQueue(mandatarisSubject);
    return;
  }

  await createrPersonFromUri(
    persoon.persoonUri,
    persoon.firstname,
    persoon.lastname,
    mandatarisGraph,
  );
}
