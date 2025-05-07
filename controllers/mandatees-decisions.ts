import {
  findDecisionAndLinkForMandataris,
  updatePublicationStatusOfMandataris,
} from '../data-access/mandataris';
import {
  TERM_MANDATARIS_TYPE,
  addBesluitToMandataris,
  getGraphsWhereInstanceExists,
  isSubjectOfType,
} from '../data-access/mandatees-decisions';
import { PUBLICATION_STATUS } from '../util/constants';

export async function processMandatarisForDecisions(
  mandatarisUri: string,
): Promise<void> {
  const { valid, besluitUri, link } =
    await isValidMandatarisWithBesluit(mandatarisUri);
  if (!valid || !besluitUri || !link) {
    return;
  }

  const graphs = await getGraphsWhereInstanceExists(mandatarisUri);

  await addBesluitToMandataris(mandatarisUri, besluitUri, link, graphs);
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
  const result = await findDecisionAndLinkForMandataris(mandatarisUri);
  if (!result) {
    console.log(
      `|> Could not find a decision for mandataris: ${mandatarisUri}`,
    );
    return { valid: false, besluitUri: null, link: null };
  }
  return {
    valid: true,
    besluitUri: result.besluit,
    link: result.link,
  };
}
