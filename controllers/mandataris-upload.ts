import fs from 'fs';
import readline from 'readline';
import { HttpError } from '../util/http-error';

export const uploadCsv = (req, res) => {
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
  rl.on('line', (line) => {
    if (firstLine) {
      firstLine = false;
      headers = parseHeader(line);
    } else {
      processData(line, headers);
    }
  });
  // Delete file after contents are processed.
  rl.on('close', () => {
    fs.unlink(formData.path, (err) => {
      if (err) {
        throw new HttpError('File could not be deleted after processing', 500);
      }
    });
  });
  return res.status(200).send({ status: 'ok' });
};

const parseHeader = (data: string): Map<string, number> => {
  console.log(data);
  const words = data.split(',');
  const headers = new Map();
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
    console.log(elem);
    if (referenceHeaders.includes(elem)) {
      headers.set(elem, index);
    } else {
      console.log('hmmm');
    }
  });

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
