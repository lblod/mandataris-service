import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { CSVRow, MandateHit } from '../types';
import { OVERIGE_BESTUURSPERIODE } from '../util/constants';
import moment, { Moment } from 'moment';

export async function getMandates(row: CSVRow) {
  const mandatesInfo = await filterMandateInfo(row);

  if (mandatesInfo?.length === 0) {
    throw new Error('No mandate found');
  }
  const hasOverigePeriode = mandatesInfo?.some(
    (info) => info.bestuursperiodeUri === OVERIGE_BESTUURSPERIODE,
  );
  const hasLegislaturePeriod = mandatesInfo?.some(
    (info) => info.bestuursperiodeUri !== OVERIGE_BESTUURSPERIODE,
  );
  if (hasOverigePeriode && hasLegislaturePeriod) {
    throw new Error(
      'We found mandates bound to legislature and non-legislature periodes.',
    );
  }

  if (hasOverigePeriode) {
    return getOverigePeriodMandatesForRowData(row, mandatesInfo);
  } else if (hasLegislaturePeriod) {
    return await getMandatesForRowData(row, mandatesInfo);
  } else {
    throw new Error('Unreachable code');
  }
}
async function filterMandateInfo(row: CSVRow) {
  const { mandateName, orgName } = row.data;

  const selectQuery = `
    prefix skos: <http://www.w3.org/2004/02/skos/core#>
    prefix mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    prefix org: <http://www.w3.org/ns/org#>
    prefix lmb: <http://lblod.data.gift/vocabularies/lmb/>
    prefix besluit: <http://data.vlaanderen.be/ns/besluit#>

    SELECT DISTINCT ?mandaat ?orgaanIT ?bestuursperiode
    WHERE {
      VALUES (?mandaatLabel ?orgaanLabel) {
        ( ${sparqlEscapeString(mandateName)} ${sparqlEscapeString(orgName)})
      }
      ?mandaat ^org:hasPost ?orgaanIT .
      ?mandaat org:role / skos:prefLabel ?mandaatLabel .

      ?orgaanIT lmb:heeftBestuursperiode ?bestuursperiode .
      ?orgaanIT mandaat:isTijdspecialisatieVan ?orgaan .
      ?orgaan skos:prefLabel ?orgaanLabel .
    }
  `;

  const result = await query(selectQuery);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result?.results?.bindings?.map((binding: any) => ({
    mandateUri: binding.mandaat.value,
    orgaanInTijdUri: binding.orgaanIT?.value,
    bestuursperiodeUri: binding.bestuursperiode?.value,
  }));
}

function getOverigePeriodMandatesForRowData(
  row: CSVRow,
  mandatesInfo: Array<any>,
): Array<MandateHit> {
  if (mandatesInfo?.length !== 1) {
    throw new Error('Found multiple mandate hits in non-legislature period.');
  }

  let momentEndDate = null;
  if (row.data.endDate) {
    momentEndDate = moment(row.data.endDate, 'DD-MM-YYYY', true);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mandatesInfo.map((info: any) => {
    return {
      mandateUri: info.mandaatUri,
      fractionUri: null,
      bestuursperiodeUri: OVERIGE_BESTUURSPERIODE,
      start: moment(row.data.startDate, 'DD-MM-YYYY', true).toDate(),
      end: momentEndDate?.toDate(),
    };
  });
}

export async function getMandatesForRowData(
  row: CSVRow,
  mandatesInfo: Array<any>,
): Promise<Array<MandateHit>> {
  const momentStartdDate = moment(row.data.startDate, 'DD-MM-YYYY', true);
  let momentEndDate = null;
  if (row.data.endDate) {
    momentEndDate = moment(row.data.endDate, 'DD-MM-YYYY', true);
  }
  const valuesStatement = mandatesInfo
    .map((info) => {
      const mandaat = sparqlEscapeUri(info.mandaatUri);
      const orgaanInTijd = sparqlEscapeUri(info.orgaanInTijdUri);
      let fractieLabel = 'mu:doesNotExist';
      if (
        row.data.fractieName &&
        row.data.fractieName.toLowerCase() !== 'onafhankelijk'
      ) {
        fractieLabel = sparqlEscapeString(row.data.fractieName);
      }

      return `(${mandaat} ${orgaanInTijd} ${fractieLabel})`;
    })
    .join('\n');

  let endDateCondition = '';
  if (row.data.endDate) {
    const momentEnd = moment(row.data.endDate, 'DD-MM-YYYY', true);
    const to = sparqlEscapeString(momentEnd.format('YYYY-MM-DD'));
    endDateCondition = `&& substr(str(?safeEndOrgaanDate), 1, 10) >= ${to}`;
  }

  const selectQuery = `
    prefix mu: <http://mu.semte.ch/vocabularies/core/>
    prefix skos: <http://www.w3.org/2004/02/skos/core#>
    prefix mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    prefix org: <http://www.w3.org/ns/org#>
    prefix regorg: <https://www.w3.org/ns/regorg#>
    prefix ext: <http://mu.semte.ch/vocabularies/ext/>
    prefix lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT distinct ?mandaat ?fractie ?period ?startOrgaanDate ?endOrgaanDate
    WHERE {
      VALUES (?mandaat ?orgaanIT ?fractieLabel ) { ${valuesStatement} }
    }
  `;

  const result = await query(selectQuery);
  if (!result.results.bindings.length) {
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result.results.bindings.map((binding: any) => {
    return {
      mandateUri: binding.mandaat.value,
      fractionUri: binding.fractie?.value,
      bestuursperiodeUri: binding.period?.value,
      start: binding.startOrgaanDate?.value,
      end: binding.endOrgaanDate?.value,
    };
  });
}
