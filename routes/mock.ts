import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { query } from 'mu';

export const mockRouter = Router();

mockRouter.get(
  '/simulate-decision-delta',
  async (req: Request, res: Response) => {
    return;
    console.log('\n |> SIMULATE DELTA DECISION');
    const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed974816591f269bb7d74aa1720922651529f3d3b2a787f5c60b73e5a0384950a4/LoketLB-mandaatGebruiker> {
      <http://data.lblod.info/id/besluiten/besluit-1> a besluit:Besluit;
        mu:uuid """aba84ba0-9b14-4560-84a6-99c5aeddd9c2""";
        mandaat:bekrachtigtOntslagVan <http://data.lblod.info/id/mandatarissen/600A91F5291D6E0008000045>. #http://localhost:4200/mandatarissen/f202051a-f5c0-4aa4-8b6b-7980a8239ed5/persoon/600A91F5291D6E0008000045/mandataris
    }
  }
  `;

    try {
      await query(insertQuery);
    } catch (error) {
      console.log('\n\t ERRRO', error);
    }

    return res.status(200).send({ status: 'ok' });
  },
);
