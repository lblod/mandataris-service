import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { Changeset, Quad } from '../types';
import { processMandatarisForDecisions } from '../controllers/mandatees-decisions';
import { ProcessingQueue } from '../services/processing-queue';
import { sparqlEscapeDateTime } from '../util/mu';

import { updateSudo } from '@lblod/mu-auth-sudo';

import { v4 as uuidv4 } from 'uuid';

const deltaRouter = Router();
export const mandatarisQueue = new ProcessingQueue();

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

setInterval(async () => {
  console.log('CREATE DECISON FOR PERSON WITH FRACTION');
  const today = sparqlEscapeDateTime(new Date());
  const id = uuidv4();
  const mandatarisId = uuidv4();
  const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;
  const persoonId =
    '1656cfde62b97fe365c5bc3813a8d7d4a76f0e14b1b9aacf4ae9e8558347aeb6';
  const persoon = `<http://data.lblod.info/id/personen/${persoonId}>`;
  const mandaat =
    '<http://data.lblod.info/id/mandaten/d6b41c777b0a9bd09de458aaeac797d041d6b48d4220e5cc4e21ce20f81d136c>';
  const fractie =
    '<http://data.lblod.info/id/fracties/5C7F7E68D5BECA000900000D>';

  const membershipId = uuidv4();
  const membership = `<http://data.lblod.info/id/lidmaatschappen/${membershipId}>`;

  const insertQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/public> {
        <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
          mu:uuid """${id}""";
          mandaat:bekrachtigtOntslagVan ${mandataris}.
        ${mandataris} a mandaat:Mandataris;
          mu:uuid """${mandatarisId}""";
          mandaat:isBestuurlijkeAliasVan ${persoon};
          mandaat:start ${today} ;
          org:holds ${mandaat}.
        ${mandataris} org:hasMembership ${membership}.
        ${membership} a org:Membership;
          org:organisation ${fractie} .
      }
    }
    `;
  await updateSudo(insertQuery);
  console.log(`DONE CREATING`);
}, 3000);

export { deltaRouter };
