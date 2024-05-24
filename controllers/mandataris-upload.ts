import fs from 'fs';
import { HttpError } from '../util/http-error';
import { createPerson, findPerson } from '../data-access/persoon';
import { CSVRow, CsvUploadState, MandateHit } from '../types';
import { parse } from 'csv-parse';
import {
  createMandatarisInstance,
  findGraphAndMandates,
  validateNoOverlappingMandate,
} from '../data-access/mandataris';
import { ensureBeleidsdomeinen } from '../data-access/beleidsdomein';

export const uploadCsv = async (req) => {
  const formData = req.file;
  if (!formData) {
    throw new HttpError('No file provided', 400);
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

  let lineNumber = 1; // headers are skipped so immediately set line to 1
  for await (const line of parser) {
    const row: CSVRow = { data: line, lineNumber };
    if (lineNumber === 0) {
      validateHeaders(row);
    }
    await processData(row, uploadState).catch((err) => {
      uploadState.errors.push(
        `[line ${lineNumber}]: failed to process person: ${err.message}`,
      );
    });
    lineNumber++;
  }

  // Delete file after contents are processed.
  await fs.unlink(formData.path, (err) => {
    if (err) {
      throw new HttpError('File could not be deleted after processing', 500);
    }
  });

  return uploadState;
};

const validateHeaders = (row: CSVRow): Map<string, number> => {
  const headers = new Map();
  const errors: string[] = [];
  const referenceHeaders = [
    'rrn',
    'firstName',
    'lastName',
    'mandateName',
    'startDateTime',
    'endDateTime',
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

const processData = async (row: CSVRow, uploadState: CsvUploadState) => {
  const data = row.data;
  if (hasMissingRequiredColumns(row, uploadState)) {
    return;
  }
  await increaseBeleidsdomeinMapping(row, uploadState);
  const { mandates, graph } = await findGraphAndMandates(row);
  if (!graph || !mandates) {
    // this means that our user possibly does not have access to the mandate
    uploadState.errors.push(
      `[line ${row.lineNumber}] No mandate found name ${data['mandateName']}`,
    );
    return;
  }
  if (invalidFraction(row, mandates, uploadState)) {
    return;
  }
  const persoon = await validateOrCreatePerson(row, uploadState);
  if (!persoon) {
    return;
  }
  await createMandatarisInstances(
    row,
    persoon.uri,
    mandates,
    graph,
    uploadState,
  );
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
    'startDateTime',
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
  graph: string,
  uploadState: CsvUploadState,
) => {
  const { startDateTime, endDateTime, rangordeString, beleidsdomeinNames } =
    row.data;
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
      startDateTime,
      endDateTime,
      rangordeString,
      beleidsdomeinNames,
      uploadState,
    );
  });
  await Promise.all(promises);
};

const invalidFraction = (
  row: CSVRow,
  mandates: MandateHit[],
  uploadState: CsvUploadState,
) => {
  const targetFraction = row.data.fractieName;
  if (!targetFraction) {
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
