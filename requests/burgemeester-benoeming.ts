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
    status: "benoemd" | "afgewezen",
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

    const parsedDate = new Date(request.body.datum);
    const smallestDate = new Date('2024-10-15T00:00:00.000Z');
    if (parsedDate.getTime() < smallestDate.getTime() || isNaN(parsedDate.getTime())) {
      throw Error(`Invalid date. Date must be before ${smallestDate}`)
    }

    const possibleStatusses = ['benoemd', 'afgewezen']
    if (!possibleStatusses.includes(request.body.status)) {
      throw Error(`Invalid status. Possible values: ${possibleStatusses.join(', ')}`);
    }

    return new this(
      request.body.burgemeesterUri,
      request.body.bestuurseenheidUri,
      request.body.status,
      request.body.datum,
      request.file
    )
  }
}