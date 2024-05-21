import fs from 'fs';
import readline from 'readline';
import { HttpError } from '../util/http-error';
import { createPerson, findPerson } from '../data-access/persoon';

export const uploadCsv = async (req) => {
  const formData = req.file;
  if (!formData) {
    throw new HttpError('No file provided', 400);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(formData.path),
    output: process.stdout,
  });
  let firstLine = true;
  let headers;
  for await (const line of rl) {
    if (firstLine) {
      firstLine = false;
      headers = parseHeader(line);
    } else {
      processData(line, headers);
    }
  }

  // Delete file after contents are processed.
  fs.unlink(formData.path, (err) => {
    if (err) {
      throw new HttpError('File could not be deleted after processing', 500);
    }
  });
};

const parseHeader = (data: string): Map<string, number> => {
  console.log(data);
  const words = data.split(',');
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
  words.forEach((elem, index) => {
    if (referenceHeaders.includes(elem)) {
      headers.set(elem, index);
    } else {
      errors.push(`${elem} is not a valid header`);
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

const processData = (data: string, headers: Map<string, number>) => {
  console.log(data);
  const words = data.split(',');
  validatePerson(
    words[headers.get('rrn') as number],
    words[headers.get('firstName') as number],
    words[headers.get('lastName') as number],
  );
};

const validatePerson = async (rrn: string, fName: string, lName: string) => {
  const persoon = await findPerson(rrn);
  if (!persoon) {
    createPerson(rrn, fName, lName);
  } else if (persoon.naam != lName || persoon.voornaam != fName) {
    console.log(
      `First name and last name of provided data differs from data in database,
      first name: ${fName} vs ${persoon.voornaam}, last name: ${lName} vs ${persoon.naam}`,
    );
  }
};
