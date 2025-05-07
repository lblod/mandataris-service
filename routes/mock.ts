import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { sparqlEscapeDateTime } from 'mu';
import { updateSudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';

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
          mu:uuid """${id}""";
          prov:wasDerivedFrom "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
          mandaat:bekrachtigtAanstellingVan ${mandataris}.
      }
      GRAPH <http://mu.semte.ch/graphs/besluit-mandataris-queue> {
        <http://que-item/${id}> ext:queueInstance ${mandataris} ;
          ext:queueTime ${sparqlEscapeDateTime(new Date())} .
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
