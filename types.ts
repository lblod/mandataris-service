export type CsvUploadState = {
  errors: string[];
  warnings: string[];
  personsCreated: number;
  mandatarissenCreated: number;
  beleidsdomeinenCreated: number;
  beleidsDomeinMapping: { [key: string]: string };
};

export type CSVRow = {
  data: {
    rrn: string;
    firstName: string;
    lastName: string;
    mandateName: string;
    startDateTime: string;
    endDateTime: string | null;
    fractieName: string | null;
    rangordeString: string | null;
    beleidsdomeinNames: string | null;
  };
  lineNumber: number;
};

export type MandateHit = {
  mandateUri: string;
  start: string;
  end: string | null;
  fractionUri: string | null;
};
