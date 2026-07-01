import { Request } from 'express';

export function mandatarisDownloadRequest(request: Request) {
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
  return commaSeparatedString && commaSeparatedString.trim() !== ''
    ? commaSeparatedString.split(',')
    : [];
}
