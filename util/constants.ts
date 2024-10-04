export enum MANDATARIS_STATUS {
  EFFECTIEF = 'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75',
}

export enum PUBLICATION_STATUS {
  DRAFT = 'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/588ce330-4abb-4448-9776-a17d9305df07',
  EFECTIEF = 'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/d3b12468-3720-4cb0-95b4-6aa2996ab188',
  BEKRACHTIGD = 'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/9d8fd14d-95d0-4f5e-b3a5-a56a126227b6',
}

export enum STATUS_CODE {
  OK = 200,
  CREATED = 201,
  INTERNAL_SERVER_ERROR = 500,
  BAD_REQUEST = 400,
}
export enum BENOEMING_STATUS {
  BENOEMD = 'benoemd',
  AFGEWEZEN = 'afgewezen',
}
