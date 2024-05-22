export type CsvUploadState = {
  errors: string[];
  warnings: string[];
  personsCreated: number;
  mandatarissenCreated: number;
};

export type CSVRow = {
  [key: string]: string;
};
