import { CronJob } from 'cron';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeDateTime, sparqlEscapeUri } from 'mu';
import { processMandatarisForDecisions } from '../controllers/mandatees-decisions';
import { createNotification } from '../util/create-notification';

const BESLUIT_CRON_PATTERN =
  process.env.BESLUIT_CRON_PATTERN || '0 */5 * * * *'; // Every 5 minutes
const BESLUIT_BUFFER_TIME = parseInt(
  process.env.BESLUIT_BUFFER_TIME || '300000',
); // 5 minutes in milliseconds
const BESLUIT_BATCH_SIZE = parseInt(process.env.BESLUIT_BATCH_SIZE || '100');
let running = false;
export const cronjob = CronJob.from({
  cronTime: BESLUIT_CRON_PATTERN,
  onTick: async () => {
    if (running) {
      return;
    }
    running = true;
    await handleBesluitQueue();
    running = false;
  },
});

async function handleBesluitQueue() {
  const batch = await fetchBatchOfMandatarisInstances();

  if (batch.length === 0) {
    return;
  }

  console.log(`Processing ${batch.length} mandataris instances`);
  for (const match of batch) {
    await safeProcessMandatarisForDecisions(match);
  }
  await cleanInstancesFromQueue(batch);
}

async function safeProcessMandatarisForDecisions(match) {
  await processMandatarisForDecisions(match.mandataris).catch(async (e) => {
    console.log(
      `ERROR processing mandataris decision instance ${match.instance}: ${e.message}`,
    );
    await createNotification({
      title: 'Error tijdens verwerken van Besluit voor mandataris',
      description: `Error tijdens verwerken van Besluit voor ${match.instance}. Gelieve de logs na te kijken voor meer informatie.`,
      type: 'error',
      graph: match.instance,
      links: [
        {
          type: 'mandataris',
          uri: match.mandataris,
        },
      ],
    }).catch((e) => {
      console.log(
        `ERROR creating notification for error to process for mandataris decision instance: ${e.message}`,
      );
    });
  });
}

async function fetchBatchOfMandatarisInstances() {
  const bufferTimeAgo = new Date(Date.now() - BESLUIT_BUFFER_TIME);
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?instance ?mandataris WHERE {
      GRAPH <http://mu.semte.ch/graphs/besluit-mandataris-queue> {
        ?instance ext:queueInstance ?mandataris ;
          ext:queueTime ?time .

        FILTER(?time < ${sparqlEscapeDateTime(bufferTimeAgo)})
      }
    } LIMIT ${BESLUIT_BATCH_SIZE}`;

  const result = await querySudo(query);
  return result.results.bindings.map((binding) => {
    return {
      mandataris: binding.mandataris.value,
      instance: binding.instance.value,
    };
  });
}

async function cleanInstancesFromQueue(batch) {
  const query = `
    DELETE {
      GRAPH <http://mu.semte.ch/graphs/besluit-mandataris-queue> {
        ?instance ?p ?o .
      }
    } WHERE {
      GRAPH <http://mu.semte.ch/graphs/besluit-mandataris-queue> {
        VALUES ?instance {
          ${batch.map((match) => sparqlEscapeUri(match.instance)).join(' ')}
        }
        ?instance ?p ?o .
      }
    }`;

  await updateSudo(query);
}
