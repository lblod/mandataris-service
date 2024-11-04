import { Request } from 'express';

import { HttpError } from '../util/http-error';
import { bestuursperiode } from '../data-access/bestuursperiode';
import { STATUS_CODE } from '../util/constants';
import { bestuursorgaan } from '../data-access/bestuursorgaan';
import { downloadMandatarissen } from '../data-access/mandataris-download';
import { persoon } from '../data-access/persoon';
import { fractie } from '../data-access/fractie';
import { bestuursfunctie } from '../data-access/bestuursfunctie';

import { json2csv } from 'json-2-csv';

export const downloadMandatarissenUsecase = {
  requestToJson,
  mandatarissenAsCsv,
};

async function mandatarissenAsCsv(requestParameters): Promise<string> {
  const {
    bestuursorgaanId,
    sort,
    hasFilterOnOnafhankelijkeFractie,
    hasFilterOnNietBeschikbareFractie,
  } = requestParameters;

  const mandatarisUris =
    await downloadMandatarissen.getWithFilters(requestParameters);

  const mandatarisData =
    await downloadMandatarissen.getPropertiesOfMandatarissen(
      mandatarisUris,
      bestuursorgaanId,
      getPropertyFilterForMandatarisSorting(sort),
      hasFilterOnNietBeschikbareFractie && !hasFilterOnOnafhankelijkeFractie,
    );

  return await jsonToCsv(mandatarisData);
}

async function requestToJson(request: Request) {
  const requiredParameters = ['bestuursperiodeId'];

  requiredParameters.map((param) => {
    if (!Object.keys(request.body).includes(param)) {
      throw new HttpError(`${param} is missing in the json body.`, 400);
    }
  });

  return validateJsonRequestParameters(request.body);
}

async function validateJsonRequestParameters(requestParameters) {
  const {
    bestuursperiodeId,
    bestuursorgaanId,
    persoonIds,
    fractieIds,
    bestuursFunctieCodeIds,
  } = requestParameters;
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
    for (const persoonId of persoonIds) {
      const isPersoon = await persoon.isValidId(persoonId);
      if (!isPersoon) {
        throw new HttpError(
          `Persoon with id ${persoonId} not found.`,
          STATUS_CODE.BAD_REQUEST,
        );
      }
    }
  }

  if (fractieIds.length >= 1) {
    for (const fractieId of fractieIds) {
      const isFractie = await fractie.isValidId(fractieId);
      if (!isFractie) {
        throw new HttpError(
          `Fractie with id ${fractieId} not found.`,
          STATUS_CODE.BAD_REQUEST,
        );
      }
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

  return requestParameters;
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
