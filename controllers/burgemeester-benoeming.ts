import { Request, Response } from 'express';
import { HttpError } from '../util/http-error';

import {
  benoemBurgemeester,
  checkAuthorization,
  confirmKnownPerson,
  createBurgemeesterBenoeming,
  endExistingMandataris,
  findBurgemeesterMandaat,
  findExistingMandataris,
  markCurrentBurgemeesterAsRejected,
} from '../data-access/burgemeester';
import { BENOEMING_STATUS } from '../util/constants';

const parseBody = (body) => {
  if (body == null) {
    throw new HttpError('No body provided', 400);
  }
  const bestuurseenheidUri = body.bestuurseenheidUri;
  if (!bestuurseenheidUri) {
    throw new HttpError('No bestuurseenheidUri provided', 400);
  }
  const burgemeesterUri = body.burgemeesterUri;
  if (!burgemeesterUri) {
    throw new HttpError('No burgemeesterUri provided', 400);
  }
  const status = body.status;
  const possibleStatuses = Object.values(BENOEMING_STATUS);
  if (!possibleStatuses.includes(status)) {
    throw new HttpError(
      `Invalid status provided. Please use the following: ${possibleStatuses.join(
        ', ',
      )}`,
      400,
    );
  }
  const date = body.datum;
  const parsedDate = new Date(date);
  const minAllowedDate = new Date('2024-10-15T00:00:00.000Z');
  if (
    !date ||
    parsedDate.getTime() < minAllowedDate.getTime() ||
    isNaN(parsedDate.getTime())
  ) {
    throw new HttpError(
      `Invalid date provided. Please use a date after ${minAllowedDate.toJSON()}`,
      400,
    );
  }
  return {
    bestuurseenheidUri,
    burgemeesterUri,
    status,
    date: parsedDate,
  } as {
    bestuurseenheidUri: string;
    burgemeesterUri: string;
    status: string;
    date: Date;
  };
};

const validateAndParseRequest = async (req: Request) => {
  if (!req.file) {
    throw new HttpError('No file provided', 400);
  }

  const parsedBody = parseBody(req.body);

  const { bestuurseenheidUri, burgemeesterUri, status, date } = parsedBody;

  const { orgGraph, mandaatUri: burgemeesterMandaat } =
    await findBurgemeesterMandaat(bestuurseenheidUri, date);

  await confirmKnownPerson(orgGraph, burgemeesterUri);
  return {
    bestuurseenheidUri,
    burgemeesterUri,
    status,
    date,
    file: req.file,
    orgGraph,
    burgemeesterMandaat,
  };
};

const onBurgemeesterBenoemingSafe = async (req: Request) => {
  const {
    bestuurseenheidUri,
    burgemeesterUri,
    status,
    date,
    file,
    orgGraph,
    burgemeesterMandaat,
  } = await validateAndParseRequest(req);

  const benoeming = await createBurgemeesterBenoeming(
    bestuurseenheidUri,
    burgemeesterUri,
    status,
    date,
    file,
    orgGraph,
  );
  if (status === BENOEMING_STATUS.BENOEMD) {
    const existing = await findExistingMandataris(
      orgGraph,
      burgemeesterMandaat,
    );
    await benoemBurgemeester(
      orgGraph,
      burgemeesterUri,
      burgemeesterMandaat,
      date,
      benoeming,
      existing?.mandataris,
      existing?.persoon,
    );
    if (existing) {
      await endExistingMandataris(
        orgGraph,
        existing.mandataris,
        benoeming,
        date,
      );
    }
  } else if (status === BENOEMING_STATUS.AFGEWEZEN) {
    await markCurrentBurgemeesterAsRejected(
      orgGraph,
      burgemeesterUri,
      burgemeesterMandaat,
      benoeming,
    );
  } else {
    // this was already checked during validation, just for clarity
    throw new HttpError('Invalid status provided', 400);
  }
};

export const onBurgemeesterBenoeming = async (req: Request, res: Response) => {
  try {
    await checkAuthorization(req);
    await onBurgemeesterBenoemingSafe(req);
    res
      .status(200)
      .send({ message: `Burgemeester-benoeming: ${req.body.status}` });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).send({ error: e.message });
    console.error(`[${status}]: ${e.message}`);
    console.error(e.stack);
  }
};
