import {
  shouldPersonBeCopied,
  copyPersonToGraph,
  getDestinationGraphPerson,
  persoon,
} from '../data-access/persoon';

import { areIdsValid, isValidId, RDF_TYPE } from '../util/valid-id';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const persoonUsecase = {
  getFractie,
  setEndDateOfActiveMandatarissen,
};

async function getFractie(
  id: string,
  bestuursperiodeId: string,
): Promise<string | null> {
  const isPersoon = await areIdsValid(RDF_TYPE.PERSON, [id]);
  if (!isPersoon) {
    throw new HttpError(
      `Person with id ${id} was not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const isBestuursperiode = await areIdsValid(RDF_TYPE.BESTUURSPERIODE, [
    bestuursperiodeId,
  ]);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const result = await persoon.getFractie(id, bestuursperiodeId);

  return result ? result.fractie.value : null;
}

async function setEndDateOfActiveMandatarissen(id: string): Promise<void> {
  const isPersoon = await areIdsValid(RDF_TYPE.PERSON, [id]);
  if (!isPersoon) {
    throw new HttpError(
      `Person with id ${id} was not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  await persoon.setEndDateOfActiveMandatarissen(id, new Date());
}

export async function putPersonInRightGraph(
  personId: string,
  orgaanId: string,
): Promise<void> {
  const isValidPerson = await isValidId(RDF_TYPE.PERSON, personId);
  if (!isValidPerson) {
    throw new HttpError(
      `Person with id ${personId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }
  const isValidOrgaan = await isValidId(RDF_TYPE.BESTUURSORGAAN, orgaanId);
  if (!isValidOrgaan) {
    throw new HttpError(
      `Organ with id ${orgaanId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const personShouldBeCopied = await shouldPersonBeCopied(personId, orgaanId);
  if (!personShouldBeCopied) {
    return;
  }

  const destinationGraph = await getDestinationGraphPerson(personId, orgaanId);
  if (!destinationGraph) {
    throw new HttpError(
      'Could not find a target graph to copy the person to.',
      STATUS_CODE.BAD_REQUEST,
    );
  }

  await copyPersonToGraph(personId, destinationGraph);
}
