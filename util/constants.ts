export enum MANDATARIS_STATUS {
  EFFECTIEF = 'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/21063a5b-912c-4241-841c-cc7fb3c73e75',
  VERHINDERD = 'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/c301248f-0199-45ca-b3e5-4c596731d5fe',
  TITELVOEREND = 'http://data.vlaanderen.be/id/concept/MandatarisStatusCode/aacb3fed-b51d-4e0b-a411-f3fa641da1b3',
}

export enum CLASSIFICATIE_CODE {
  DISTRICT = 'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000003',
  BURGEMEESTER = 'http://data.vlaanderen.be/id/concept/BestuursorgaanClassificatieCode/4955bd72cd0e4eb895fdbfab08da0284',
}

export enum FUNCTIE_CODE {
  BURGEMEESTER = 'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000013',
  AANGEWEZEN_BURGEMEESTER = 'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/7b038cc40bba10bec833ecfe6f15bc7a',
}

export enum PUBLICATION_STATUS {
  DRAFT = 'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/588ce330-4abb-4448-9776-a17d9305df07',
  EFFECTIEF = 'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/d3b12468-3720-4cb0-95b4-6aa2996ab188',
  BEKRACHTIGD = 'http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/9d8fd14d-95d0-4f5e-b3a5-a56a126227b6',
}

export enum FRACTIE_TYPE {
  SAMENWERKING = 'http://data.vlaanderen.be/id/concept/Fractietype/Samenwerkingsverband',
  ONAFHANKELIJK = 'http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk',
}

export enum GRAPH {
  FORM_HISTORY = 'http://mu.semte.ch/graphs/formHistory',
  LINKED_INSTANCES = 'http://mu.semte.ch/graphs/linkedInstances',
  PUBLIC = 'http://mu.semte.ch/graphs/public',
  APPLICATION = 'http://mu.semte.ch/graphs/application',
}

export enum SCHEME {
  BELEIDSDOMEIN_CODE = 'http://data.vlaanderen.be/id/conceptscheme/BeleidsdomeinCode',
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

// TODO: Transform these to enums
export const GEMEENTERAADSLID_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000011';
export const LID_OCMW_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000015';
export const VOORZITTER_GEMEENTERAAD_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000012';
export const VOORZITTER_RMW_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000016';
export const SCHEPEN_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000014';
export const TOEGEVOEGDE_SCHEPEN_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/59a90e03-4f22-4bb9-8c91-132618db4b38';
export const LID_VB_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000017';
export const BURGEMEESTER_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000013';
export const VOORZITTER_VB_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000018';
export const AANGEWEZEN_BURGEMEESTER_FUNCTIE_CODE =
  'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/7b038cc40bba10bec833ecfe6f15bc7a';
