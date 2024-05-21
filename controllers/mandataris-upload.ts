import fs from 'fs';
import readline from 'readline';
import { HttpError } from '../util/http-error';

export const uploadCsv = async (req, res) => {
  let promiseResolve, promiseReject;
  let promiseRejected = false;
  const promise = new Promise(function (resolve, reject) {
    promiseResolve = resolve;
    promiseReject = reject;
  });

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
    try {
      if (firstLine) {
        firstLine = false;
        headers = parseHeader(line);
      } else {
        if (!promiseRejected) {
          processData(line, headers);
        }
      }
    } catch (err) {
      console.log(err);
      promiseReject();
      promiseRejected = true;
      rl.close();
    }
  });
  // Delete file after contents are processed.
  rl.on('close', () => {
    try {
      fs.unlink(formData.path, (err) => {
        if (err) {
          throw new HttpError(
            'File could not be deleted after processing',
            500,
          );
        }
      });
      if (!promiseRejected) {
        promiseResolve();
      }
    } catch (err) {
      console.log(err);
    }
  });
  return promise;
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
