import { Request, Response } from 'express';
import { HttpError } from '../util/http-error';

import {
  addBenoemingTriple,
  createBurgemeesterBenoeming,
  createBurgemeesterFromScratch,
  createNotificationAangesteldeBurgemeester,
  createNotificationAfgewezenBurgemeester,
  createNotificationMultipleAangesteldeBurgemeesters,
  createNotificationNoCorrespondingAangewezenBurgemeester,
  createNotificationOtherPersonWithBurgemeesterMandaat,
  findBurgemeesterMandates,
  getPersoonMandaatMandatarissen,
  isBestuurseenheidDistrict,
  otherPersonHasMandate,
  setPublicationStatusWithDate,
} from '../data-access/burgemeester';
import { BENOEMING_STATUS, PUBLICATION_STATUS } from '../util/constants';
import { checkAuthorization } from '../data-access/authorization';
import {
  copyFromPreviousMandataris,
  endExistingMandataris,
  findExistingMandatarisOfPerson,
} from '../data-access/mandataris';
import { personExistsInGraph } from '../data-access/persoon';

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
  const minAllowedDate = new Date('2024-12-01T00:00:00.000Z');
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

  const isDistrictBestuurseenheid =
    await isBestuurseenheidDistrict(bestuurseenheidUri);
  if (isDistrictBestuurseenheid) {
    throw new HttpError(
      'Ratification of districtsburgemeesters is not yet supported.',
      400,
    );
  }

  const { orgGraph, burgemeesterMandaatUri, aangewezenBurgemeesterMandaatUri } =
    await findBurgemeesterMandates(bestuurseenheidUri, date);

  const personExists = await personExistsInGraph(burgemeesterUri, orgGraph);
  if (!personExists) {
    throw new HttpError(`Person with uri ${burgemeesterUri} not found`, 400);
  }

  return {
    bestuurseenheidUri,
    burgemeesterUri,
    status,
    date,
    file: req.file,
    orgGraph,
    burgemeesterMandaatUri,
    aangewezenBurgemeesterMandaatUri,
  };
};

const handleAangewezenBurgemeester = async (
  orgGraph: string,
  existingMandataris: string | undefined | null,
  date: Date,
  benoemingUri: string,
) => {
  if (existingMandataris) {
    await endExistingMandataris(
      orgGraph,
      existingMandataris,
      date,
      benoemingUri,
    );
  } else {
    createNotificationNoCorrespondingAangewezenBurgemeester(orgGraph);
  }
};

const handleBurgemeester = async (
  orgGraph: string,
  burgemeesterPersoonUri: string,
  burgemeesterMandaatUri: string,
  date: Date,
  benoemingUri: string,
  existingMandataris: string | undefined | null,
) => {
  const otherBurgemeesterFound = await otherPersonHasMandate(
    orgGraph,
    burgemeesterPersoonUri,
    burgemeesterMandaatUri,
    date,
  );

  if (otherBurgemeesterFound) {
    createNotificationOtherPersonWithBurgemeesterMandaat(
      orgGraph,
      otherBurgemeesterFound,
    );
  }

  const burgemeesterMandatarissenExist = await getPersoonMandaatMandatarissen(
    orgGraph,
    burgemeesterPersoonUri,
    burgemeesterMandaatUri,
    date,
  );

  if (burgemeesterMandatarissenExist.length != 0) {
    for (const burgemeesterMandataris of burgemeesterMandatarissenExist) {
      setPublicationStatusWithDate(
        orgGraph,
        burgemeesterMandataris,
        date,
        PUBLICATION_STATUS.BEKRACHTIGD,
      );
    }
    return burgemeesterMandatarissenExist;
  }

  if (existingMandataris) {
    // we can copy over the existing values for the new burgemeester from the previous mandataris
    const newBurgemeesterMandataris = await copyFromPreviousMandataris(
      orgGraph,
      existingMandataris,
      date,
      burgemeesterMandaatUri,
    );
    return [newBurgemeesterMandataris];
  } else {
    // we need to create a new mandataris from scratch
    const newBurgemeesterMandataris = await createBurgemeesterFromScratch(
      orgGraph,
      burgemeesterPersoonUri,
      burgemeesterMandaatUri,
      date,
      benoemingUri,
    );
    return [newBurgemeesterMandataris];
  }
};

const transferAangewezenBurgemeesterToBurgemeester = async (
  orgGraph: string,
  burgemeesterPersoonUri: string,
  burgemeesterMandaatUri: string,
  date: Date,
  benoemingUri: string,
  existingMandataris: string | undefined | null,
) => {
  const newBurgemeesterMandatarissen = await handleBurgemeester(
    orgGraph,
    burgemeesterPersoonUri,
    burgemeesterMandaatUri,
    date,
    benoemingUri,
    existingMandataris,
  );

  await handleAangewezenBurgemeester(
    orgGraph,
    existingMandataris,
    date,
    benoemingUri,
  );

  for (const mandataris of newBurgemeesterMandatarissen) {
    addBenoemingTriple(
      orgGraph,
      mandataris,
      benoemingUri,
      BENOEMING_STATUS.BENOEMD,
    );
  }

  if (newBurgemeesterMandatarissen.length == 1) {
    createNotificationAangesteldeBurgemeester(
      orgGraph,
      newBurgemeesterMandatarissen.at(0),
    );
  } else if (newBurgemeesterMandatarissen.length >= 1) {
    createNotificationMultipleAangesteldeBurgemeesters(
      orgGraph,
      newBurgemeesterMandatarissen,
    );
  }
};

const markCurrentBurgemeesterAsRejected = async (
  orgGraph: string,
  burgemeesterUri: string,
  date: Date,
  benoemingUri: string,
  existingMandatarisUri: string | undefined,
) => {
  if (!existingMandatarisUri) {
    throw new HttpError(
      `No existing mandataris found for burgemeester(${burgemeesterUri})`,
      400,
    );
  }

  await endExistingMandataris(
    orgGraph,
    existingMandatarisUri,
    date,
    benoemingUri,
  );

  addBenoemingTriple(
    orgGraph,
    existingMandatarisUri,
    benoemingUri,
    BENOEMING_STATUS.AFGEWEZEN,
  );

  createNotificationAfgewezenBurgemeester(orgGraph, existingMandatarisUri);
};

const onBurgemeesterBenoemingSafe = async (req: Request) => {
  const {
    bestuurseenheidUri,
    burgemeesterUri,
    status,
    date,
    file,
    orgGraph,
    burgemeesterMandaatUri,
    aangewezenBurgemeesterMandaatUri,
  } = await validateAndParseRequest(req);

  const benoemingUri = await createBurgemeesterBenoeming(
    bestuurseenheidUri,
    burgemeesterUri,
    status,
    date,
    file,
    orgGraph,
  );
  const originalMandatarisUri = await findExistingMandatarisOfPerson(
    orgGraph,
    aangewezenBurgemeesterMandaatUri,
    burgemeesterUri,
  );
  if (status === BENOEMING_STATUS.BENOEMD) {
    await transferAangewezenBurgemeesterToBurgemeester(
      orgGraph,
      burgemeesterUri,
      burgemeesterMandaatUri,
      date,
      benoemingUri,
      originalMandatarisUri,
    );
  } else if (status === BENOEMING_STATUS.AFGEWEZEN) {
    await markCurrentBurgemeesterAsRejected(
      orgGraph,
      burgemeesterUri,
      date,
      benoemingUri,
      originalMandatarisUri,
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
