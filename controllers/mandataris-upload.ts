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
  rl.on('line', (line) => {
    if (firstLine) {
      firstLine = false;
    } else {
      processData(line);
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

const processData = (data: string) => {
  console.log(data);
  const words = data.split(',');
  validatePersons(words[0], words[1], words[2]);
};

const validatePersons = (rrn: string, fName: string, lName: string) => {
  console.log(rrn);
  console.log(fName);
  console.log(lName);
};
