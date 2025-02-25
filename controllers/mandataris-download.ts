import { HttpError } from '../util/http-error';
import { STATUS_CODE } from '../util/constants';
import { jsonToCsv } from '../util/json-to-csv';

import { downloadMandatarissen } from '../data-access/mandataris-download';
import { areIdsValid, RDF_TYPE } from '../util/valid-id';

import moment from 'moment';

export const mandatarisDownloadUsecase = {
  toCsv,
};

async function toCsv(queryParams): Promise<string> {
  await validateQueryParams(queryParams);

  const mandatarisUris =
    await downloadMandatarissen.getUrisForFilters(queryParams);

  const mandatarisData =
    await downloadMandatarissen.getPropertiesOfMandatarissen(
      mandatarisUris,
      queryParams.bestuursorgaanId,
      getSortingPropertyForQuery(queryParams.sort),
    );
  const formatMandatarisData = getFormattedJsonResult(mandatarisData);

  return await jsonToCsv(formatMandatarisData);
}

async function validateQueryParams(queryParams) {
  const {
    bestuursperiodeId,
    bestuursorgaanId,
    persoonIds,
    fractieIds,
    bestuursFunctieCodeIds,
  } = queryParams;
  const isBestuursperiode = await areIdsValid(RDF_TYPE.BESTUURSPERIODE, [
    bestuursperiodeId,
  ]);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  if (bestuursorgaanId) {
    const isBestuursorgaan = await areIdsValid(RDF_TYPE.BESTUURSORGAAN, [
      bestuursorgaanId,
    ]);
    if (!isBestuursorgaan) {
      throw new HttpError(
        `Bestuursorgaan with id ${bestuursorgaanId} not found.`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }
  if (persoonIds.length >= 1) {
    const arePersonenValid = await areIdsValid(RDF_TYPE.PERSON, persoonIds);
    if (!arePersonenValid) {
      throw new HttpError(
        `Not all person ids where found. (${persoonIds.join(', ')}).`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }

  if (fractieIds.length >= 1) {
    const areFractiesValid = await areIdsValid(RDF_TYPE.FRACTIE, fractieIds);
    if (!areFractiesValid) {
      throw new HttpError(
        `Not all fractie ids where found. (${fractieIds.join(', ')}).`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }

  if (bestuursFunctieCodeIds.length >= 1) {
    const areCodesValid = await areIdsValid(
      RDF_TYPE.BESTUURSFUNCTIE_CODE,
      bestuursFunctieCodeIds,
    );
    if (!areCodesValid) {
      throw new HttpError(
        `Not all bestuursfunctie code ids where found. (${bestuursFunctieCodeIds.join(
          ', ',
        )}).`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }

  return queryParams;
}

function getSortingPropertyForQuery(sort?: string) {
  sort = sort ? sort : 'is-bestuurlijke-alias-van.achternaam';

  const mapping = {
    'is-bestuurlijke-alias-van.gebruikte-voornaam': '?Voornaam',
    '-is-bestuurlijke-alias-van.gebruikte-voornaam': '?Voornaam',
    'is-bestuurlijke-alias-van.achternaam': '?Naam',
    '-is-bestuurlijke-alias-van.achternaam': '?Naam',
    'heeft-lidmaatschap.binnen-fractie.naam': '?fractieLabel',
    '-heeft-lidmaatschap.binnen-fractie.naam': '?fractieLabel',
    'bekleedt.bestuursfunctie.label': '?mandaatLabel',
    '-bekleedt.bestuursfunctie.label': '?mandaatLabel',
    start: '?start',
    '-start': '?start',
    einde: '?einde',
    '-einde': '?einde',
    'status.label': '?statusLabel',
    '-status.label': '?statusLabel',
    'publication-status': '?publicatieStatusLabel',
    '-publication-status': '?publicatieStatusLabel',
  };

  if (!Object.keys(mapping).includes(sort)) {
    return null;
  }

  return {
    ascOrDesc: sort[0] === '-' ? 'DESC' : ('ASC' as 'ASC' | 'DESC'),
    filterProperty: mapping[sort],
  };
}

function getFormattedJsonResult(jsonArray) {
  const dateFormat = (date?: string) =>
    date?.trim() !== '' ? moment(date).format('DD-MM-YYYY') : '';
  const formatMap = {
    StartMandaat: (date) => dateFormat(date),
    EindeMandaat: (date) => dateFormat(date),
  };
  return jsonArray.map((jsonObject) => {
    const formattedResult = {};
    for (const key in jsonObject) {
      const originalValue = jsonObject[key];
      const keyToFormat = Object.keys(formatMap).includes(key);
      formattedResult[key] = keyToFormat
        ? formatMap[key](originalValue)
        : originalValue;
    }

    return formattedResult;
  });
}
