import { HttpError } from '../util/http-error';
import { STATUS_CODE } from '../util/constants';

import { bestuursperiode } from '../data-access/bestuursperiode';
import { bestuursorgaan } from '../data-access/bestuursorgaan';
import { downloadMandatarissen } from '../data-access/mandataris-download';
import { persoon } from '../data-access/persoon';
import { fractie } from '../data-access/fractie';
import { bestuursfunctie } from '../data-access/bestuursfunctie';

import { json2csv } from 'json-2-csv';

export const downloadMandatarissenUsecase = {
  mandatarissenAsCsv,
};

async function mandatarissenAsCsv(queryParams): Promise<string> {
  await validateJsonQueryParams(queryParams);

  const {
    bestuursorgaanId,
    sort,
    hasFilterOnOnafhankelijkeFractie,
    hasFilterOnNietBeschikbareFractie,
  } = queryParams;

  const mandatarisUris =
    await downloadMandatarissen.getWithFilters(queryParams);

  const mandatarisData =
    await downloadMandatarissen.getPropertiesOfMandatarissen(
      mandatarisUris,
      bestuursorgaanId,
      getPropertyFilterForMandatarisSorting(sort),
      hasFilterOnNietBeschikbareFractie && !hasFilterOnOnafhankelijkeFractie,
    );

  return await jsonToCsv(mandatarisData);
}

async function validateJsonQueryParams(queryParams) {
  const {
    bestuursperiodeId,
    bestuursorgaanId,
    persoonIds,
    fractieIds,
    bestuursFunctieCodeIds,
  } = queryParams;
  const isBestuursperiode = await bestuursperiode.isValidId(bestuursperiodeId);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }
  if (bestuursorgaanId) {
    const isBestuursorgaan = await bestuursorgaan.isValidId(bestuursorgaanId);
    if (!isBestuursorgaan) {
      throw new HttpError(
        `Bestuursorgaan with id ${bestuursorgaanId} not found.`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }

  if (persoonIds.length >= 1) {
    const personen = await persoon.areIdsValid(persoonIds);
    if (!personen.isValid) {
      throw new HttpError(
        `Person with id: ${personen.unknownIds.join(', ')} not found.`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }

  if (fractieIds.length >= 1) {
    const fracties = await fractie.areIdsValid(fractieIds);
    if (!fracties.isValid) {
      throw new HttpError(
        `Fractie with id: ${fracties.unknownIds.join(', ')} not found.`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }

  if (bestuursFunctieCodeIds.length >= 1) {
    for (const bestuursFunctieCodeId of bestuursFunctieCodeIds) {
      const isCode = await bestuursfunctie.isValidId(bestuursFunctieCodeId);
      if (!isCode) {
        throw new HttpError(
          `Bestuursfunctie code with id ${bestuursFunctieCodeId} not found.`,
          STATUS_CODE.BAD_REQUEST,
        );
      }
    }
  }

  return queryParams;
}

async function jsonToCsv(mandatarisData) {
  if (!mandatarisData || mandatarisData.length === 0) {
    return '';
  }

  let csvString = '';
  try {
    csvString = await json2csv(mandatarisData);
  } catch (error) {
    throw new HttpError(
      'Something went wrong while parsing json to a csv string.',
      STATUS_CODE.INTERNAL_SERVER_ERROR,
    );
  }

  return csvString;
}

function getPropertyFilterForMandatarisSorting(sort: string | null) {
  if (!sort) {
    return null;
  }

  const mapping = {
    'is-bestuurlijke-alias-van.gebruikte-voornaam': '?fName',
    '-is-bestuurlijke-alias-van.gebruikte-voornaam': '?fName',
    'is-bestuurlijke-alias-van.achternaam': '?saveLName',
    '-is-bestuurlijke-alias-van.achternaam': '?saveLName',
    'heeft-lidmaatschap.binnen-fractie.naam': '?fractieLabel',
    '-heeft-lidmaatschap.binnen-fractie.naam': '?fractieLabel',
    'bekleedt.bestuursfunctie.label': '?mandaatLabel',
    '-bekleedt.bestuursfunctie.label': '?mandaatLabel',
    start: '?start',
    '-start': '?start',
    einde: '?saveEinde',
    '-einde': '?saveEinde',
    'status.label': '?statusLabel',
    '-status.label': '?statusLabel',
    'publication-status': '?savePublicatieStatusLabel',
    '-publication-status': '?savePublicatieStatusLabel',
  };

  if (!Object.keys(mapping).includes(sort)) {
    return null;
  }

  return {
    ascOrDesc: sort[0] === '-' ? 'DESC' : ('ASC' as 'ASC' | 'DESC'),
    filterProperty: mapping[sort],
  };
}
