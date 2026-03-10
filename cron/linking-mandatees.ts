import { CronJob } from 'cron';
import {
  getMandateIdsMissingLink,
  linkInstances,
} from '../data-access/linked-mandataris';
import { getLinkedMandatesGemeenteToOcmw } from '../controllers/linked-mandataris';
import { HttpError } from '../util/http-error';

const LINKING_MANDATEES_CRON_PATTERN =
  process.env.BESLUIT_CRON_PATTERN || '*/32 * * * * *'; // Every 32 seconds
const LINKING_MANDATEES_BATCH_SIZE =
  process.env.LINKING_MANDATEES_BATCH_SIZE || 250;
let running = false;

console.log(
  `LINKING_MANDATEES_CRON_PATTERN SET TO: ${LINKING_MANDATEES_CRON_PATTERN}`,
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
    const ids = await getMandateIdsMissingLink(linkedBfCodeAsValuesString, {
      batchSize: LINKING_MANDATEES_BATCH_SIZE,
    });

    try {
      const idsAsLinkFormat = ids.map((id) => {
        return {
          fromId: id.mandataris,
          toId: id.toBeLinkedMandataris,
        };
      });
      await linkInstances(idsAsLinkFormat);
      console.log(`Linked ${ids.length} mandatees`);
    } catch (error) {
      throw new HttpError(
        `Something went wrong while creating the link between ${ids.length} mandatees.`,
        500,
      );
    }

    console.log(`
    ====================================================================
    =                   Finished LINKING OF MANDATEES                  =
    ====================================================================
    `);
    running = false;
  },
});
