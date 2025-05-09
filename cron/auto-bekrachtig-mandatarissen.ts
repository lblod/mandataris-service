import { CronJob } from 'cron';
import { updateSudo } from '@lblod/mu-auth-sudo';

const BESLUIT_CRON_PATTERN =
  process.env.BESLUIT_CRON_PATTERN || '0 */5 * * * *'; // Every 5 minutes
let running = false;
export const cronjob = CronJob.from({
  cronTime: BESLUIT_CRON_PATTERN,
  onTick: async () => {
    if (running) {
      return;
    }
    running = true;
    await updateStateOfPendingMandatarisWithDecision();
    running = false;
  },
});

async function updateStateOfPendingMandatarisWithDecision() {
  await updateSudo(`
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>

    DELETE {
      GRAPH ?g {
        ?s lmb:hasPublicationStatus ?status.
        ?s dct:modified ?oldMod.
      }
    }
    INSERT {
      GRAPH ?g {
        ?s lmb:hasPublicationStatus <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/9d8fd14d-95d0-4f5e-b3a5-a56a126227b6> . # Bekrachtigd
        ?s dct:modified ?now.
      }
    }
    WHERE {
      GRAPH ?g {
        ?s a mandaat:Mandataris.
        {
          VALUES ?status {
            <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/588ce330-4abb-4448-9776-a17d9305df07> # Draft
            <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/d3b12468-3720-4cb0-95b4-6aa2996ab188> # Niet bekrachtigd
          }
          ?s lmb:hasPublicationStatus ?status.
        } UNION {
          ?s a mandaat:Mandataris.
          FILTER NOT EXISTS {
            ?s lmb:hasPublicationStatus ?status.
          }
        }
        ?s dct:modified ?oldMod.
      }
      ?g ext:ownedBy ?someone.
      ?besluit mandaat:bekrachtigtAanstellingVan ?s.
      BIND(NOW() as ?now)
    }
  `);
}
