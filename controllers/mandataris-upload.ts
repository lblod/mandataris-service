import fs from 'fs';
import { HttpError } from '../util/http-error';
import { createPerson, findPerson } from '../data-access/persoon';
import { CSVRow, CsvUploadState, MandateHit } from '../types';
import { parse } from 'csv-parse';
import { findGraphAndMandates } from '../data-access/mandataris';

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
  };

  const parser = fs.createReadStream(formData.path).pipe(
    parse({
      columns: true,
    }),
  );

  let lineNumber = 0;
  for await (const line of parser) {
    if (lineNumber === 0) {
      validateHeaders(line);
    }
    const row: CSVRow = { data: line, lineNumber };
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
  return validateOrCreatePerson(row, uploadState);
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
  const hasMissingFraction = !mandates.some((mandate) => !mandate.fraction);
  if (hasMissingFraction) {
    uploadState.errors.push(
      `[line ${row.lineNumber}] No fraction found for mandate ${row.data.mandateName}`,
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
    uploadState.errors.push(`[line ${row.lineNumber}] No RRN provided`);
    return;
  }
  const persoon = await findPerson(parsedRrn);
  if (!persoon) {
    await createPerson(parsedRrn, fName, lName);
    uploadState.personsCreated++;
  } else if (persoon.naam != lName || persoon.voornaam != fName) {
    uploadState.warnings.push(
      `[line ${row.lineNumber}] First name and last name of provided data differs from data in database,
      first name: ${fName} vs ${persoon.voornaam}, last name: ${lName} vs ${persoon.naam}`,
    );
  }
};
