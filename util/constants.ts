export enum MANDATARIS_STATUS {
  BEEINDIGD = 'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/b8866fa2-d61c-4e3d-afaf-8a29eaaa7fb9',
  EFFECTIEF = 'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75',
}

export enum PUBLICATION_STATUS {
  DRAFT = 'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/588ce330-4abb-4448-9776-a17d9305df07',
  BEKRACHTIGT = 'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/9d8fd14d-95d0-4f5e-b3a5-a56a126227b6',
}

export enum BASE_RESOURCE {
  MANDATARIS = 'http://data.lblod.info/id/mandatarissen/',
  PERSONEN = 'http://data.lblod.info/id/personen/',
  FRACTIES = 'http://data.lblod.info/id/fracties/',
}

export enum FRACTIE_TYPE {
  ONAFHANKELIJK = 'http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk',
  SAMENWERKINGSVERBAND = 'http://data.vlaanderen.be/id/concept/Fractietype/Samenwerkingsverband',
}

export enum STATUS_CODE {
  CREATED = 201,
  OK = 200,
  BAD_REQUEST = 400,
  INTERNAL_SERVER_ERROR = 500,
}
