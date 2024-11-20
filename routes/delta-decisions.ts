import Router from 'express-promise-router';
import { sparqlEscapeUri, sparqlEscapeDateTime } from 'mu';

import { Request, Response } from 'express';

import { Changeset, Quad } from '../types';
import { updateSudo } from '@lblod/mu-auth-sudo';
import { v4 as uuid } from 'uuid';
import { BESLUIT_STAGING_GRAPH } from '../data-access/mandatees-decisions';

const deltaRouter = Router();

deltaRouter.post('/decisions', async (req: Request, res: Response) => {
  console.log('|>Triggered the decisions endpoint!');
  const changesets: Changeset[] = req.body;
  const insertTriples = changesets
    .map((changeset: Changeset) => changeset.inserts)
    .flat()
    .filter(
      (quad) =>
        quad.graph.value.startsWith(BESLUIT_STAGING_GRAPH) &&
        quad.predicate.value.startsWith(
          'http://data.vlaanderen.be/ns/mandaat#bekrachtigt',
        ),
    );

  const mandatarisSubjects = Array.from(
    new Set(insertTriples.map((quad: Quad) => quad.object.value)),
  );

  const newData = mandatarisSubjects
    .map((mandataris: string) => {
      const id = uuid();
      const instanceUri = sparqlEscapeUri(
        `http://mu.semte.ch/vocabularies/ext/queueInstance/${id}`,
      );
      const mandatarisUri = sparqlEscapeUri(mandataris);
      return `${instanceUri} ext:queueInstance ${mandatarisUri} ;
            ext:queueTime ${sparqlEscapeDateTime(new Date())} .`;
    })
    .join('\n');

  // keep these mandataris instances in the database instead of memory
  // so if we crash we know they should still be processed
  // wait BUFFER_TIME to process the mandataris so we are reasonably sure that we have all the  info
  const query = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluit-mandataris-queue> {
      ${newData}
    }
  }`;

  await updateSudo(query).catch((e) => {
    res.status(500).send({ status: 'error', message: e.message });
    return;
  });

  res.status(200).send({ status: 'ok' });
});

export { deltaRouter };
