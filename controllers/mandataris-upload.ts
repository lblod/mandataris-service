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
  rl.on('line', (line) => {
    console.log(line);
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
