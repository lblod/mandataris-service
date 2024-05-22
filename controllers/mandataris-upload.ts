import fs from 'fs';
import { HttpError } from '../util/http-error';
import { createPerson, findPerson } from '../data-access/persoon';
import { CSVRow, CsvUploadState } from '../types';
import { parse } from 'csv-parse';
import { findGraphAndMandate } from '../data-access/mandataris';

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
    await processData(lineNumber, line, uploadState).catch((err) => {
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

const validateHeaders = (data: CSVRow): Map<string, number> => {
  console.log(data);
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
    if (data[elem] === undefined) {
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

const processData = async (
  lineNumber: number,
  data: CSVRow,
  uploadState: CsvUploadState,
) => {
  console.log(data);
  const { mandate, graph } = await findGraphAndMandate(
    data['startDateTime'],
    data['mandateName'],
  );
  if (!graph || !mandate) {
    // this means that our user possibly does not have access to the mandate
    uploadState.errors.push(
      `[line ${lineNumber}] No mandate found name ${data['mandateName']}`,
    );
    return;
  }
  return validateOrCreatePerson(
    lineNumber,
    data['rrn'],
    data['firstName'],
    data['lastName'],
    uploadState,
  );
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
  lineNumber: number,
  rrn: string,
  fName: string,
  lName: string,
  uploadState: CsvUploadState,
) => {
  const parsedRrn = parseRrn(rrn);
  if (!parsedRrn) {
    uploadState.errors.push(`[line ${lineNumber}] No RRN provided`);
    return;
  }
  const persoon = await findPerson(parsedRrn);
  if (!persoon) {
    await createPerson(parsedRrn, fName, lName);
    uploadState.personsCreated++;
  } else if (persoon.naam != lName || persoon.voornaam != fName) {
    uploadState.warnings.push(
      `[line ${lineNumber}] First name and last name of provided data differs from data in database,
      first name: ${fName} vs ${persoon.voornaam}, last name: ${lName} vs ${persoon.naam}`,
    );
  }
};
