import { Request } from 'express';
import { HttpError } from '../util/http-error';
import { bestuursperiode } from '../data-access/bestuursperiode';
import { STATUS_CODE } from '../util/constants';
import { bestuursorgaan } from '../data-access/bestuursorgaan';
import { downloadMandatarissen } from '../data-access/mandataris-download';

export const downloadMandatarissenUsecase = {
  requestToJson,
  fetchMandatarissen,
  transformToCsv,
};

function requestToJson(request: Request) {
  const requiredParameters = ['bestuursperiodeId'];

  requiredParameters.map((param) => {
    if (!Object.keys(request.body).includes(param)) {
      throw new HttpError(`${param} is missing in the json body.`, 400);
    }
  });

  return request.body;
}

async function fetchMandatarissen(requestParameters) {
  const { bestuursperiodeId, bestuursorgaanId, sort } = requestParameters;
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

  const mandatarisUris =
    await downloadMandatarissen.getWithFilters(requestParameters);

  return await downloadMandatarissen.getPropertiesOfMandatarissen(
    mandatarisUris,
    getPropertyFilterForMandatarisSorting(sort),
  );
}

async function transformToCsv(mandatarisData) {
  if (!mandatarisData || mandatarisData.length === 0) {
    return '';
  }
  const titles = Object.keys(mandatarisData[0]);
  const separator = ';';

  const columnValues = mandatarisData
    .map((it) => {
      return Object.values(it).join(separator);
    })
    .join('\n');

  return `${titles.join(separator)}\n${columnValues}`;
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
  };

  if (!Object.keys(mapping).includes(sort)) {
    return null;
  }

  return {
    ascOrDesc: sort[0] === '-' ? 'DESC' : ('ASC' as 'ASC' | 'DESC'),
    filterProperty: mapping[sort],
  };
}
