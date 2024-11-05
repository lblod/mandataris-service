import { Request } from 'express';

import { HttpError } from '../util/http-error';

export function mandatarisExportRequest(request: Request) {
  const requiredParameters = ['bestuursperiodeId'];

  requiredParameters.map((param) => {
    if (!Object.keys(request.query).includes(param)) {
      throw new HttpError(`${param} is missing in the query parameters`, 400);
    }
  });

  const {
    bestuursperiodeId,
    bestuursorgaanId,
    activeOnly,
    persoonIds,
    fractieIds,
    hasFilterOnOnafhankelijkeFractie,
    hasFilterOnNietBeschikbareFractie,
    bestuursFunctieCodeIds,
    sort,
  } = request.query;

  return {
    bestuursperiodeId,
    bestuursorgaanId,
    activeOnly: activeOnly === 'true',
    persoonIds: stringToArray(persoonIds),
    fractieIds: stringToArray(fractieIds),
    hasFilterOnOnafhankelijkeFractie:
      hasFilterOnOnafhankelijkeFractie === 'true',
    hasFilterOnNietBeschikbareFractie:
      hasFilterOnNietBeschikbareFractie === 'true',
    bestuursFunctieCodeIds: stringToArray(bestuursFunctieCodeIds),
    sort,
  };
}

function stringToArray(commaSeparatedString) {
  return commaSeparatedString.trim() !== ''
    ? commaSeparatedString.split(',')
    : [];
}
