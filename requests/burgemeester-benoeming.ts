import { Request } from 'express';

export class BurgemeesterBenoemingRequest {
  burgemeesterUri: string;
  bestuurseenheidUri: string;
  status: string;
  date: Date;
  file: unknown;


  constructor(
    burgemeesterUri: string,
    bestuurseenheidUri: string,
    status: string,
    date: Date,
    file: unknown
  ) {
    this.burgemeesterUri = burgemeesterUri;
    this.bestuurseenheidUri = bestuurseenheidUri;
    this.status = status;
    this.date = date;
    this.file = file;
  }

  static fromRequest(request: Request) {
    if (!request.file) {
      throw Error('No file provided.');
    }

    if (!request.body) {
      throw Error('No body provided.');
    }

    const params = ['bestuurseenheidUri', 'burgemeesterUri', 'status', 'datum']
    const missingParamsInBody = params.filter(property => !request.body[property])

    if (missingParamsInBody.length !== 0) {
      throw Error(`The body is missing these parameters: ${missingParamsInBody.join(', ')}.`);
    }

    return new this(
      request.body.burgemeesterUri,
      request.body.bestuurseenheidUri,
      request.body.status,
      new Date(request.body.datum),
      request.file
    )
  }
}