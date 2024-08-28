import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { query, sparqlEscapeDateTime } from 'mu';

export const mockRouter = Router();

mockRouter.get('/add-decision', async (req: Request, res: Response) => {
  console.log('\n \t|>Triggered the add decision endpoint');
  const today = sparqlEscapeDateTime(new Date());
  const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed974816591f269bb7d74aa1720922651529f3d3b2a787f5c60b73e5a0384950a4/LoketLB-mandaatGebruiker> {
      <http://data.lblod.info/id/besluiten/besluit-18> a besluit:Besluit;
        mu:uuid """aba84ba0-9b14-4560-84a6-99c5aeddd9c2""";
        mandaat:bekrachtigtOntslagVan <http://data.lblod.info/id/mandatarissen/600A91F5291D6E00090000000000004>.
      
      <http://data.lblod.info/id/mandatarissen/600A91F5291D6E00090000000000004> a mandaat:Mandataris;
        mu:uuid """1cbe1f88-01fb-427e-bad8-9c3f065e3d02""";
        mandaat:isBestuurlijkeAliasVan <http://data.lblod.info/id/personen/1234567689>;
        mandaat:start ${today} ;
        org:holds <http://data.lblod.info/id/mandaten/f990dcf131e3c0647a7b3b48a6c3d0d516350023567145701824d2c59ce01741>.
    }
  }
  `;

  try {
    await query(insertQuery);
  } catch (error) {
    console.log(`\n\t ERRRO`, error);
  }

  return res.status(200).send({ status: 'ok' });
});
