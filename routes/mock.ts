import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';
import { createBurgemeesterFromScratch } from '../data-access/burgemeester';
import { sparqlEscapeUri } from 'mu';
import {
  bulkUpdateEndDate,
  copyFromPreviousMandataris,
  endExistingMandataris,
  generateMandatarissen,
} from '../data-access/mandataris';

export const mockRouter = Router();

mockRouter.get('/add-decision', async (req: Request, res: Response) => {
  try {
    const id = uuidv4();
    // http://localhost:4200/mandatarissen/1656cfde62b97fe365c5bc3813a8d7d4a76f0e14b1b9aacf4ae9e8558347aeb6/persoon/5FF2DC1278A81C0009000A15/mandataris
    const mandatarisId = '5FF2DC1278A81C0009000A15';
    const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;

    const insertQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX prov: <http://www.w3.org/ns/prov#>

    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
        <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
          prov:wasDerivedFrom "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
          mandaat:bekrachtigtAanstellingVan ${mandataris}.
      }
    }
    `;
    await updateSudo(insertQuery);
    res.status(200).send({
      mandatarisUri: mandataris,
      besluit: `<http://data.lblod.info/id/besluiten/${id}>`,
    });
  } catch (error) {
    res.status(500).send({ status: 'error', error: error.message });
    return;
  }
});

mockRouter.get('/clear-decisions', async (_req: Request, res: Response) => {
  //the mock functions here will create inconsistent states in the consumer graph. Clear it using this endpoint
  const query = `
    DELETE {
      GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
        ?s ?p ?o.
      }
      GRAPH ?g {
        <http://data.lblod.info/id/mandatarissen/5FF2DC1278A81C0009000A15>
          <http://lblod.data.gift/vocabularies/lmb/hasPublicationStatus> ?publicatieStatus .
      }
    }
    INSERT {
      GRAPH ?g {
        <http://data.lblod.info/id/mandatarissen/5FF2DC1278A81C0009000A15>
          <http://lblod.data.gift/vocabularies/lmb/hasPublicationStatus>
            <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/d3b12468-3720-4cb0-95b4-6aa2996ab188> . # Niet bekrachtigd
      }
    }
    WHERE {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
     ?s ?p ?o.
    }
    GRAPH ?g {
      <http://data.lblod.info/id/mandatarissen/5FF2DC1278A81C0009000A15>
        <http://lblod.data.gift/vocabularies/lmb/hasPublicationStatus> ?publicatieStatus .
    }
  }`;
  await updateSudo(query);

  res.status(200).send({ status: 'cleared' });
});

mockRouter.get('/test-mandataris-date', async (req: Request, res: Response) => {
  const getStartDateForMandatarisUri = async (uri) => {
    const dateResult = await querySudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    select ?start
    where {
      graph ?g {
        ${sparqlEscapeUri(uri)} mandaat:start ?start .
      }
    }  
  `);
    return dateResult.results.bindings[0]?.start.value;
  };
  const getEndDateForMandatarisUri = async (uri) => {
    const dateResult = await querySudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    select ?end
    where {
      graph ?g {
        ${sparqlEscapeUri(uri)} mandaat:einde ?end .
      }
    }  
  `);
    return dateResult.results.bindings[0]?.end.value;
  };
  const graphAalst =
    'http://mu.semte.ch/graphs/organizations/974816591f269bb7d74aa1720922651529f3d3b2a787f5c60b73e5a0384950a4/LoketLB-mandaatGebruiker';

  const inputStartDate = new Date('2025-07-08T10:35:10Z');
  const inputEndDate = new Date('2026-01-00:35:10Z');
  const burgemeesterMandatarisUri = await createBurgemeesterFromScratch(
    graphAalst,
    'http://burgemeester-person-uri',
    'http://mandaaat-uri',
    inputStartDate,
    'http://benoemings-uri',
  );
  const startBurgemeester = await getStartDateForMandatarisUri(
    burgemeesterMandatarisUri,
  );

  const mandatarisCopyUri = await copyFromPreviousMandataris(
    graphAalst,
    burgemeesterMandatarisUri,
    inputStartDate,
    'http://mandaaat-uri',
  );

  const startCopy = await getStartDateForMandatarisUri(mandatarisCopyUri);

  await endExistingMandataris(
    graphAalst,
    mandatarisCopyUri,
    inputEndDate,
    'http://benoemings-uri',
  );

  const endOfCopy = await getEndDateForMandatarisUri(mandatarisCopyUri);

  const generatedMandatarisUri = 'http://test-mandataris-uri';
  await generateMandatarissen(
    [
      {
        id: 'test-mandataris',
        uri: generatedMandatarisUri,
        rangorde: 'Eerste schepen',
      },
    ],
    {
      count: 1,
      startDate: inputStartDate,
      endDate: inputEndDate,
      mandaatUri: 'http://mandaaat-uri',
    },
  );
  const startOfGenerated = await getStartDateForMandatarisUri(
    generatedMandatarisUri,
  );
  const endOfGenerated = await getEndDateForMandatarisUri(
    generatedMandatarisUri,
  );

  const mandatarissenToEndUris = [
    burgemeesterMandatarisUri,
    mandatarisCopyUri,
    generatedMandatarisUri,
  ];
  await bulkUpdateEndDate(mandatarissenToEndUris, inputEndDate);

  const bulkEditBurgemeesterEnd = await getEndDateForMandatarisUri(
    burgemeesterMandatarisUri,
  );
  const bulkEditCopyEnd = await getEndDateForMandatarisUri(mandatarisCopyUri);
  const bulkEditGeneratedEnd = await getEndDateForMandatarisUri(
    generatedMandatarisUri,
  );

  res.status(200).send([
    {
      test: 'Creation of burgemeester mandataris has correct start date',
      comparison: {
        input: inputStartDate,
        database: startBurgemeester,
      },
    },
    {
      test: 'Copy the burgemeester mandataris has the correct start date',
      comparison: {
        input: inputStartDate,
        database: startCopy,
      },
    },
    {
      test: 'Ending the copied mandataris results in a correct end date',
      comparison: {
        input: inputEndDate,
        database: endOfCopy,
      },
    },
    {
      test: 'Generated mandataris has correct start and end date',
      comparison: {
        input: {
          start: inputStartDate,
          end: inputEndDate,
        },
        database: {
          start: startOfGenerated,
          end: endOfGenerated,
        },
      },
    },
    {
      test: 'Bulk ending of mandatarissen results in correct end dates',
      comparison: {
        input: {
          burgemeester: inputEndDate,
          copy: inputEndDate,
          generated: inputEndDate,
        },
        database: {
          burgemeester: bulkEditBurgemeesterEnd,
          copy: bulkEditCopyEnd,
          generated: bulkEditGeneratedEnd,
        },
      },
    },
  ]);
});
