import fs from 'fs';
import readline from 'readline';
import { HttpError } from '../util/http-error';

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
  validatePersons(
    words[headers.get('rrn') as number],
    words[headers.get('firstName') as number],
    words[headers.get('lastName') as number],
  );
};

const validatePersons = (rrn: string, fName: string, lName: string) => {
  console.log(rrn);
  console.log(fName);
  console.log(lName);
};
