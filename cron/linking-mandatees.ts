import { CronJob } from 'cron';
import {
  getMandateIdsMissingLink,
  linkInstances,
} from '../data-access/linked-mandataris';
import { getLinkedMandatesGemeenteToOcmw } from '../controllers/linked-mandataris';
import { HttpError } from '../util/http-error';
import { querySudo } from '@lblod/mu-auth-sudo';
import { getSparqlResults } from '../util/sparql-result';

const LINKING_MANDATEES_CRON_PATTERN =
  process.env.LINKING_MANDATEES_CRON_PATTERN || '*/4 * * * *'; // Every 4 minutes
const LINKING_MANDATEES_BATCH_SIZE =
  process.env.LINKING_MANDATEES_BATCH_SIZE || 250;
let running = false;

console.log(
  `LINKING_MANDATEES_CRON_PATTERN SET TO: ${LINKING_MANDATEES_CRON_PATTERN}`,
);
console.log(
  `LINKING_MANDATEES_BATCH_SIZE SET TO: ${LINKING_MANDATEES_BATCH_SIZE}`,
);

export const cronjob = CronJob.from({
  cronTime: LINKING_MANDATEES_CRON_PATTERN,
  onTick: async () => {
    if (running) {
      return;
    }
    running = true;
    console.log(`
    ===================================================================
    =                   Started LINKING OF MANDATEES                  =
    ===================================================================
    `);
    const linkedBfCodeAsValuesString = getLinkedMandatesGemeenteToOcmw();
    await addMissingLinksForAllGraphPairs(linkedBfCodeAsValuesString);

    console.log(`
    ====================================================================
    =                   Finished LINKING OF MANDATEES                  =
    ====================================================================
    `);
    running = false;
  },
});

async function addMissingLinksForAllGraphPairs(
  linkedBfCodeAsValuesString: string,
) {
  const result = await querySudo(
    `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX eenheidClassificatieCode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    SELECT ?gemeenteGraph ?ocmwGraph WHERE {
      GRAPH ?gemeenteGraph {
        ?s a mandaat:Mandataris .
      }
      GRAPH ?ocmwGraph {
        ?s a mandaat:Mandataris .
      }
      ?gemeenteGraph ext:ownedBy ?gemeenteEenheid .
      ?gemeenteEenheid besluit:classificatie eenheidClassificatieCode:5ab0e9b8a3b2ca7c5e000001 . # Gemeente 
      ?ocmwGraph ext:ownedBy ?ocwmEenheid .
      ?ocwmEenheid besluit:classificatie eenheidClassificatieCode:5ab0e9b8a3b2ca7c5e000002 . # OCMW
      ?ocwmEenheid ext:isOCMWVoor ?gemeenteEenheid .
    }`,
  );
  const pairs = getSparqlResults(result);

  for (const pair of pairs) {
    await addMissingLinks(
      linkedBfCodeAsValuesString,
      pair.gemeenteGraph.value,
      pair.ocmwGraph.value,
    );
  }
}

async function addMissingLinks(
  gemeenteGraph: string,
  ocmwGraph: string,
  linkedBfCodeAsValuesString: string,
) {
  const ids = await getMandateIdsMissingLink(
    gemeenteGraph,
    ocmwGraph,
    linkedBfCodeAsValuesString,
    {
      batchSize: LINKING_MANDATEES_BATCH_SIZE,
    },
  );

  try {
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      await linkInstances(id.mandataris, id.toBeLinkedMandataris);
    }
    console.log(`Linked ${ids.length} mandatees`);
  } catch (error) {
    throw new HttpError(
      `Something went wrong while creating the link between ${ids.length} mandatees.`,
      500,
    );
  }
}
