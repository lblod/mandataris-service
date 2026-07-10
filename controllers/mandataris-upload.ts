import fs from 'fs';
import { HttpError } from '../util/http-error';
import { createPerson, findPerson } from '../data-access/persoon';
import { CSVRow, CsvUploadState, MandateHit } from '../types';
import { Parser, parse } from 'csv-parse';
import {
  createMandatarisInstance,
  createOnafhankelijkeFractie,
  findMandatesByName,
  findOnafhankelijkeFractieForPerson,
  validateNoOverlappingMandate,
} from '../data-access/mandataris';
import { ensureBeleidsdomeinen } from '../data-access/beleidsdomein';
import { query, sparqlEscapeUri } from 'mu';

export const uploadCsv = async (req) => {
  const formData = req.file;
  if (!formData) {
    throw new HttpError('No file provided', 400);
  }

  const HEADER_MU_SESSION_ID = 'mu-session-id';
  const sessionUri = req.get(HEADER_MU_SESSION_ID);
  const bestuurseenheidUri = await getBestuurseenheidForSession(sessionUri);
  if (!bestuurseenheidUri) {
    throw new HttpError(
      'We could not find the bestuurseenheid for the session',
      400,
    );
  }

  const uploadState: CsvUploadState = {
    errors: [],
    warnings: [],
    personsCreated: 0,
    mandatarissenCreated: 0,
    beleidsdomeinenCreated: 0,
    beleidsDomeinMapping: {},
  };

  const parser = fs.createReadStream(formData.path).pipe(
    parse({
      columns: true,
    }),
  );

  await parseLineByLine(parser, uploadState, bestuurseenheidUri).catch(
    (err) => {
      const lineIndex = err.message?.match(/line (\d+)/)?.[1];
      const lineString = lineIndex ? `[line ${lineIndex}] ` : '';
      uploadState.errors.push(
        `${lineString}Failed to parse CSV: ${err.message}`,
      );
    },
  );

  // Delete file after contents are processed.
  await fs.unlink(formData.path, (err) => {
    if (err) {
      throw new HttpError('File could not be deleted after processing', 500);
    }
  });

  return uploadState;
};

const parseLineByLine = async (
  parser: Parser,
  uploadState: CsvUploadState,
  bestuurseenheidUri: string,
) => {
  let lineNumber = 1; // headers are skipped so immediately set line to 1
  for await (const line of parser) {
    const row: CSVRow = { data: line, lineNumber };
    if (lineNumber === 0) {
      validateHeaders(row);
    }
    await processData(row, uploadState, bestuurseenheidUri).catch((err) => {
      uploadState.errors.push(
        `[line ${lineNumber}]: Failed to process person: ${err.message}`,
      );
    });
    lineNumber++;
  }
};

const validateHeaders = (row: CSVRow): Map<string, number> => {
  const headers = new Map();
  const errors: string[] = [];
  const referenceHeaders = [
    'rrn',
    'firstName',
    'lastName',
    'mandateName',
    'orgName',
    'startDate',
    'endDate',
    'fractieName',
    'rangordeString',
    'beleidsdomeinNames',
  ];
  referenceHeaders.forEach((elem) => {
    if (row.data[elem] === undefined) {
      errors.push(`${elem} column is not present`);
    }
  });

  if (errors.length != 0) {
    throw new HttpError(
      'Received csv files with the wrong headers:',
      400,
      errors,
    );
  }

  return headers;
};

const processData = async (row: CSVRow, uploadState: CsvUploadState, bestuurseenheidUri: string) => {
  const data = row.data;
  if (hasMissingRequiredColumns(row, uploadState)) {
    return;
  }
  await increaseBeleidsdomeinMapping(row, uploadState);
  const mandates = await findMandatesByName(row, bestuurseenheidUri);
  if (!mandates || mandates.length === 0) {
    // this means that our user possibly does not have access to the mandate
    uploadState.errors.push(
      `[line ${row.lineNumber}] No mandate found name ${data['mandateName']}`,
    );
    return;
  }
  const persoon = await validateOrCreatePerson(row, uploadState);
  if (!persoon) {
    return;
  }
  if (await invalidFraction(row, mandates, uploadState, persoon.uri)) {
    return;
  }
  await createMandatarisInstances(row, persoon.uri, mandates, uploadState);
};

const hasMissingRequiredColumns = (
  row: CSVRow,
  uploadState: CsvUploadState,
) => {
  const required = [
    'rrn',
    'firstName',
    'lastName',
    'mandateName',
    'orgName',
    'startDate',
  ];
  let hasMissingData = false;
  required.forEach((elem) => {
    if (!row.data[elem] || row.data[elem].trim().length == 0) {
      uploadState.errors.push(
        `[line ${row.lineNumber}] Missing required column: ${elem}`,
      );
      hasMissingData = true;
    }
  });
  return hasMissingData;
};

const increaseBeleidsdomeinMapping = async (
  row: CSVRow,
  state: CsvUploadState,
) => {
  const { beleidsdomeinNames } = row.data;
  if (!beleidsdomeinNames) {
    return;
  }
  const names = beleidsdomeinNames.split('|').map((name) => name.trim());
  const toFetch = names.filter((name) => !state.beleidsDomeinMapping[name]);
  if (toFetch.length === 0) {
    return;
  }
  const { existing, created } = await ensureBeleidsdomeinen(toFetch);
  state.beleidsdomeinenCreated += Object.keys(created).length;
  state.beleidsDomeinMapping = {
    ...state.beleidsDomeinMapping,
    ...existing,
    ...created,
  };
};

const createMandatarisInstances = async (
  row: CSVRow,
  persoonUri: string,
  mandates: MandateHit[],
  uploadState: CsvUploadState,
) => {
  const { startDate, endDate, rangordeString, beleidsdomeinNames } = row.data;
  const hasOverlappingMandate = await validateNoOverlappingMandate(
    row,
    persoonUri,
    mandates,
    uploadState,
  );
  if (hasOverlappingMandate) {
    return;
  }
  const promises = mandates.map((mandate) => {
    return createMandatarisInstance(
      persoonUri,
      mandate,
      startDate,
      endDate,
      rangordeString,
      beleidsdomeinNames,
      uploadState,
    );
  });
  await Promise.all(promises);
};

const invalidFraction = async (
  row: CSVRow,
  mandates: MandateHit[],
  uploadState: CsvUploadState,
  persoonUri: string,
) => {
  const targetFraction = row.data.fractieName;
  if (
    !targetFraction ||
    row.data.fractieName?.toLowerCase() === 'onafhankelijk'
  ) {
    const fractieUri = await ensureOnafhankelijkeFractieForPerson(
      persoonUri,
      mandates,
    );
    mandates.forEach((mandate) => {
      mandate.fractionUri = fractieUri;
    });
    return false;
  }
  const hasMissingFraction = mandates.some((mandate) => !mandate.fractionUri);
  if (hasMissingFraction) {
    uploadState.errors.push(
      `[line ${row.lineNumber}] No fraction found for fraction ${row.data.fractieName}`,
    );
  }
  return hasMissingFraction;
};

const ensureOnafhankelijkeFractieForPerson = async (
  persoonUri: string,
  mandates: MandateHit[],
) => {
  const mandateUris = mandates.map((mandate) => mandate.mandateUri);
  const existingOnafhankelijkeFractie =
    await findOnafhankelijkeFractieForPerson(persoonUri, mandateUris);

  if (existingOnafhankelijkeFractie) {
    return existingOnafhankelijkeFractie;
  }

  return await createOnafhankelijkeFractie(mandateUris);
};

const parseRrn = (rrn: string) => {
  if (!rrn || rrn.trim().length == 0) {
    return null;
  }
  const cleanedRrn = rrn.replace(/\D/g, '');
  if (cleanedRrn.length != 11) {
    return null;
  }
  return cleanedRrn;
};

const validateOrCreatePerson = async (
  row: CSVRow,
  uploadState: CsvUploadState,
) => {
  const { rrn, firstName: fName, lastName: lName } = row.data;
  const parsedRrn = parseRrn(rrn);
  if (!parsedRrn) {
    uploadState.errors.push(
      `[line ${row.lineNumber}] No or invalid RRN provided`,
    );
    return;
  }
  let persoon = await findPerson(parsedRrn);
  if (!persoon) {
    persoon = await createPerson(parsedRrn, fName, lName);
    uploadState.personsCreated++;
  } else if (persoon.naam != lName || persoon.voornaam != fName) {
    uploadState.warnings.push(
      `[line ${row.lineNumber}] First name and last name of provided data differs from data in database,
      first name: ${fName} vs ${persoon.voornaam}, last name: ${lName} vs ${persoon.naam}`,
    );
  }
  return persoon;
};

async function getBestuurseenheidForSession(sessionUri?: string) {
  if (!sessionUri) {
    return null;
  }

  const sparqlResult = await query(
    `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?bestuurseenheid ?id
    WHERE {
      GRAPH <http://mu.semte.ch/graphs/sessions> {
        ${sparqlEscapeUri(sessionUri)} ext:sessionGroup ?bestuurseenheid .
      }
      ?bestuurseenheid mu:uuid ?id .
    } LIMIT 1
  `,
    { sudo: true },
  );

  const result = sparqlResult.results.bindings[0];
  if (!result) {
    return null;
  }

  return result.bestuurseenheid?.value;
}
