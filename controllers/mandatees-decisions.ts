import {
  findDecisionForMandataris,
  updatePublicationStatusOfMandataris,
} from '../data-access/mandataris';
import {
  TERM_MANDATARIS_TYPE,
  checkIfMinimalMandatarisInfoAvailable,
  getMandatarisTriplesInStagingGraph,
  isSubjectOfType,
} from '../data-access/mandatees-decisions';
import { MandatarisBesluitLookup, MandatarisFullInfo } from '../types';
import { PUBLICATION_STATUS } from '../util/constants';
import { copyBeleidsdomeinInfo } from './mandataris-besluit/beleidsdomein';
import { copyFractionInfo } from './mandataris-besluit/fractie';
import { copyMandatarisInfo } from './mandataris-besluit/mandataris';
import { copyPersonInfo } from './mandataris-besluit/persoon';

export async function processMandatarisForDecisions(
  mandatarisUri: string,
): Promise<void> {
  const { valid, besluitUri, type } =
    await isValidMandatarisWithBesluit(mandatarisUri);
  if (!valid || !besluitUri || !type) {
    return;
  }
  const mandatarisPointer: MandatarisBesluitLookup = {
    mandatarisUri,
    besluitUri,
    type,
  };
  await handleMandatarisSubject(mandatarisPointer);
  await updatePublicationStatusOfMandataris(
    mandatarisUri,
    PUBLICATION_STATUS.BEKRACHTIGD,
  );
}

async function isValidMandatarisWithBesluit(mandatarisUri: string) {
  const isMandataris = await isSubjectOfType(
    TERM_MANDATARIS_TYPE.value,
    mandatarisUri,
  );
  if (!isMandataris) {
    console.log(
      `|> URI: ${mandatarisUri} is not of type: ${TERM_MANDATARIS_TYPE.value}`,
    );
    return { valid: false, besluitUri: null, type: null };
  }

  // The decision can also be a besluit:Artikel this
  // because the besluit does not have a direct relation to the mandataris yet
  const result = await findDecisionForMandataris(mandatarisUri);
  if (!result) {
    console.log(
      `|> Could not find a decision for mandataris: ${mandatarisUri}`,
    );
    return { valid: false, besluitUri: null, type: null };
  }
  return {
    valid: true,
    besluitUri: result.besluit,
    type:
      result.link.toLocaleLowerCase().indexOf('ontslag') >= 0
        ? ('ontslag' as const)
        : ('aanstelling' as const),
  };
}

export async function handleMandatarisSubject(
  mandatarisBesluitInfo: MandatarisBesluitLookup,
) {
  const { graph, minimalInfoAvailable } =
    await checkIfMinimalMandatarisInfoAvailable(mandatarisBesluitInfo);
  if (!minimalInfoAvailable || !graph) {
    return;
  }
  const mandatarisTriples = await getMandatarisTriplesInStagingGraph(
    mandatarisBesluitInfo.mandatarisUri,
  );

  const mandatarisFullInfo: MandatarisFullInfo = {
    ...mandatarisBesluitInfo,
    triples: mandatarisTriples,
    graph,
  };

  await copyMandatarisInfo(mandatarisFullInfo);
  await copyPersonInfo(mandatarisFullInfo);
  await copyFractionInfo(mandatarisFullInfo);
  await copyBeleidsdomeinInfo(mandatarisFullInfo);
}
