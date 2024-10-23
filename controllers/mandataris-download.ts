import { Request } from 'express';
import { HttpError } from '../util/http-error';
import { bestuursperiode } from '../data-access/bestuursperiode';
import { BESTUURSFUNCTIE_CODES, STATUS_CODE } from '../util/constants';
import { bestuursorgaan } from '../data-access/bestuursorgaan';
import { downloadMandatarissen } from '../data-access/mandataris-download';
import { fractie } from '../data-access/fractie';

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
  const {
    bestuursperiodeId,
    bestuursorgaanId,
    bestuursfunctieCodeUri,
    fractieId,
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
  if (bestuursfunctieCodeUri) {
    if (!BESTUURSFUNCTIE_CODES.includes(bestuursfunctieCodeUri)) {
      throw new HttpError(
        `Bestuursfunctiecode uri ${bestuursfunctieCodeUri} not found.`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }
  if (fractieId) {
    const isFractie = await fractie.isValidId(fractieId);
    if (!isFractie) {
      throw new HttpError(
        `Fractie with id ${bestuursorgaanId} not found.`,
        STATUS_CODE.BAD_REQUEST,
      );
    }
  }

  const mandatarisUris =
    await downloadMandatarissen.getWithFilters(requestParameters);

  return await downloadMandatarissen.getPropertiesOfMandatarissen(
    mandatarisUris,
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
