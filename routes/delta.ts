import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { Changeset, Quad } from '../types';
import { processMandatarisForDecisions } from '../controllers/mandatees-decisions';
import { ProcessingQueue } from '../services/processing-queue';
import { updateSudo } from '@lblod/mu-auth-sudo';

const deltaRouter = Router();
export const mandatarisQueue = new ProcessingQueue();

deltaRouter.get('/manual', async (req: Request, res: Response) => {
  console.log('MANUAL');
  const mandatarisUri =
    'http://data.lblod.info/id/mandatarissen/65C9E11C653C4BA4B205DE16';
  const deltaTrigger = `
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX prov: <http://www.w3.org/ns/prov#>

    INSERT DATA {
       GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
       <http://data.lblod.info/artikels/01220764-ce48-4aa5-a608-1492574042d5> a besluit:Artikel;
            prov:wasDerivedFrom <https://publicatie.gelinkt-notuleren.vlaanderen.be/Mesen/Gemeente/zittingen/cd90b301-3532-11e9-a984-7db43f975d75/notulen>;
            <http://mu.semte.ch/vocabularies/ext/bekrachtigtAanstellingVan> <${mandatarisUri}> 
      }
    }
  
  `;
  await updateSudo(deltaTrigger);

  return res.status(200).send({ status: 'ok' });
});

deltaRouter.post('/decisions', async (req: Request, res: Response) => {
  console.log('|>Triggered the decisions endpoint!');
  const changesets: Changeset[] = req.body;
  const insertTriples = changesets
    .map((changeset: Changeset) => changeset.inserts)
    .flat();

  const mandatarisSubjects = Array.from(
    new Set(insertTriples.map((quad: Quad) => quad.object)),
  );

  mandatarisQueue.setMethodToExecute(processMandatarisForDecisions);
  mandatarisQueue.moveManualQueueToQueue();
  mandatarisQueue.addToQueue(mandatarisSubjects);

  return res.status(200).send({ status: 'ok' });
});

export { deltaRouter };
