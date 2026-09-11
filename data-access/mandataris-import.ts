import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { CSVRow, MandateHit } from '../types';
import { OVERIGE_BESTUURSPERIODE } from '../util/constants';
import moment from 'moment';

type MandateInfo = {
  mandateUri: string;
  orgaanInTijdUri?: string;
  bestuursperiodeUri?: string;
};

export async function getMandates(
  row: CSVRow,
  bestuurseenheidUri: string,
): Promise<Array<MandateHit>> {
  const mandatesInfo = await filterMandateInfo(row, bestuurseenheidUri);

  if (mandatesInfo?.length === 0) {
    throw new Error('No mandates found');
  }
  const hasOverigePeriode = mandatesInfo?.some(
    (info) => info.bestuursperiodeUri === OVERIGE_BESTUURSPERIODE,
  );
  const hasLegislaturePeriod = mandatesInfo?.some(
    (info) => info.bestuursperiodeUri !== OVERIGE_BESTUURSPERIODE,
  );
  if (hasOverigePeriode && hasLegislaturePeriod) {
    throw new Error(
      'We found mandates bound to legislature and non-legislature periodes',
    );
  }

  if (hasOverigePeriode) {
    return getOverigePeriodMandatesForRowData(row, mandatesInfo);
  } else if (hasLegislaturePeriod) {
    return await getLegislaturePeriodMandatesForRowData(row, mandatesInfo);
  } else {
    throw new Error('Unreachable code');
  }
}

async function filterMandateInfo(
  row: CSVRow,
  bestuurseenheidUri: string,
): Promise<Array<MandateInfo>> {
  const { mandateName, orgName } = row.data;

  const selectQuery = `
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?mandaat ?orgaanIT ?bestuursperiode
    WHERE {
      VALUES (?mandaatLabel ?orgaanLabel) {
        ( ${sparqlEscapeString(mandateName)} ${sparqlEscapeString(orgName)})
      }
      ?mandaat ^org:hasPost ?orgaanIT .
      ?mandaat org:role / skos:prefLabel ?mandaatLabel .

      ?orgaanIT lmb:heeftBestuursperiode ?bestuursperiode .

      ?orgGraph ext:ownedBy ${sparqlEscapeUri(bestuurseenheidUri)} .
      graph ?orgGraph {
        ?orgaanIT mandaat:isTijdspecialisatieVan ?orgaan .
        ?orgaan skos:prefLabel ?orgaanLabel .
      }
    }
  `;

  const result = await query(selectQuery);

  return result?.results?.bindings?.map(
    (binding: any) =>
      ({
        mandateUri: binding.mandaat.value,
        orgaanInTijdUri: binding.orgaanIT?.value,
        bestuursperiodeUri: binding.bestuursperiode?.value,
      }) as MandateInfo,
  );
}

function getOverigePeriodMandatesForRowData(
  row: CSVRow,
  mandatesInfo: Array<MandateInfo>,
): Array<MandateHit> {
  if (mandatesInfo?.length !== 1) {
    throw new Error('Found multiple mandate hits in non-legislature period');
  }

  let momentEndDate = null;
  if (row.data.endDate) {
    momentEndDate = moment(row.data.endDate, 'DD-MM-YYYY', true);
  }

  return mandatesInfo.map((info: any) => {
    return {
      mandateUri: info.mandateUri,
      fractionUri: null,
      bestuursperiodeUri: OVERIGE_BESTUURSPERIODE,
      start: moment(row.data.startDate, 'DD-MM-YYYY', true).toDate(),
      end: momentEndDate?.toDate(),
    };
  });
}

async function getLegislaturePeriodMandatesForRowData(
  row: CSVRow,
  mandatesInfo: Array<MandateInfo>,
): Promise<Array<MandateHit>> {
  const momentStartDate = moment(row.data.startDate, 'DD-MM-YYYY', true);
  const sparqlStartDate = sparqlEscapeString(
    momentStartDate.format('YYYY-MM-DD'),
  );

  const fractieSparql = getFractieSparql(row);

  const valuesStatement = mandatesInfo
    .map((info) => {
      const mandaat = sparqlEscapeUri(info.mandateUri);
      const orgaanInTijd = sparqlEscapeUri(info.orgaanInTijdUri);

      return `(${mandaat} ${orgaanInTijd} ${fractieSparql.label})`;
    })
    .join('\n');

  const safeSparqlEndDate = moment('01-01-3000', 'DD-MM-YYYY', true).format(
    'YYYY-MM-DD',
  );
  let endDateSparqlFilterCondition = '';
  if (row.data.endDate) {
    const momentEnd = moment(row.data.endDate, 'DD-MM-YYYY', true);
    const sparqlEndDate = sparqlEscapeString(momentEnd.format('YYYY-MM-DD'));
    endDateSparqlFilterCondition = `&& substr(str(?safeEndOrgaanDate), 1, 10) >= ${sparqlEndDate}`;
  }

  const selectQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT distinct ?mandaat ?fractie ?period ?startOrgaanDate ?endOrgaanDate
    WHERE {
      VALUES (?mandaat ?orgaanIT ?fractieLabel ) { ${valuesStatement} }

      ?orgaanIT lmb:heeftBestuursperiode ?bestuursperiode .
      ?orgaanIT mandaat:bindingStart ?startOrgaanDate .
      OPTIONAL {
        ?orgaanIT mandaat:bindingEinde ?endOrgaanDate .
      }

      bind(str(if(bound(?endOrgaanDate), ?endOrgaanDate, ${safeSparqlEndDate})) as ?safeEndOrgaanDate)

      FILTER(
        substr(str(?startOrgaanDate), 1, 10) <= ${sparqlStartDate}
        ${endDateSparqlFilterCondition}
      )

      ${fractieSparql.sparqlFilter}
    }
  `;

  const result = await query(selectQuery);
  if (!result.results.bindings.length) {
    return [];
  }

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

function getFractieSparql(row: CSVRow): {
  label: string;
  sparqlFilter: string;
} {
  const { fractieName } = row.data;

  let fractieLabel = 'mu:doesNotExist';
  if (fractieName && fractieName.toLowerCase() !== 'onafhankelijk') {
    fractieLabel = sparqlEscapeString(fractieName);
  }

  let sparqlFilter = '';
  if (fractieName && fractieName.toLowerCase() !== 'onafhankelijk') {
    sparqlFilter = `
    {
      filter(?hasStartYearPeriod)
      ?otherOrgaanIT lmb:heeftBestuursperiode ?period .
      ?fractie org:memberOf ?otherOrgaanIT .
      ?fractie regorg:legalName ${fractieLabel} .
    }
    union
    {
      filter(!?hasStartYearPeriod)
      optional {
        ?fractie org:memberOf ?anyOrgaanIT .
        ?fractie regorg:legalName ${fractieLabel} .
      }
    }
  `;
  }

  return {
    label: fractieLabel,
    sparqlFilter: sparqlFilter,
  };
}
