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
  updateDifferencesOfMandataris,
  getTriplesOfSubject,
  TERM_STAGING_GRAPH,
  isSubjectOfType,
  TERM_MANDATARIS_TYPE,
} from '../data-access/mandatees-decisions';
import { copyPerson } from '../data-access/persoon';
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

  const decision = await findDecisionForMandataris(mandatarisSubject);
  if (!decision) {
    console.log(
      `|> Could not find a decision/artikel for mandataris: ${mandatarisSubject.value}`,
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

  const mandaat = await findMandateOfMandataris(mandatarisSubject);
  if (!mandaat) {
    console.log(
      `|> No mandaat found for mandataris with subject: ${mandatarisSubject.value} \n|>\n`,
    );
    mandatarisQueue.addToManualQueue(mandatarisSubject);
    return;
  }

  const mandatarisGraph = await findBestuurseenheidForMandaat(mandaat);

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
  const currentQuads = await getQuadsInLmbFromTriples(incomingTriples);
  // NOTE: This place will only update the mandataris triples, if the besluiten
  // needs to be added to our Database we should add them after this
  await updateDifferencesOfMandataris(
    currentQuads,
    incomingTriples,
    mandatarisGraph,
  );

  const persoonInLMBGraph = await findPersoonForMandatarisInGraph(
    mandatarisSubject,
    mandatarisGraph,
  );
  console.log('|> persoonInLMBGraph: ', persoonInLMBGraph);
  console.log(
    `|> Is persoon in graph of mandataris (LMB)? ${
      persoonInLMBGraph ? true : false
    }`,
  );
  if (persoonInLMBGraph) {
    const overlappingMandataris = await findOverlappingMandataris(
      persoonInLMBGraph,
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

    return;
  }

  const persoonInStagingGraph = await findPersoonForMandatarisInGraph(
    mandatarisSubject,
    TERM_STAGING_GRAPH,
  );
  console.log('|> persoon in staging graph? ', persoonInStagingGraph);
  if (persoonInStagingGraph) {
    await copyPerson(persoonInStagingGraph, mandatarisGraph);
    return;
  }
}
