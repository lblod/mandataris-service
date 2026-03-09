import { CronJob } from 'cron';
import {
  fetchCountOfUnlinkedMandatees,
  getMandateUrisMissingLink,
  linkInstances,
} from '../data-access/linked-mandataris';
import { getLinkedMandates } from '../controllers/linked-mandataris';
import { HttpError } from '../util/http-error';

const LINKING_MANDATEES_CRON_PATTERN =
  process.env.BESLUIT_CRON_PATTERN || '0 */1 * * * *'; // Every 1 minutes
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
    const linkedBfCodeAsValuesString = getLinkedMandates();
    const countOfUnlinkedMandatees = await fetchCountOfUnlinkedMandatees(
      linkedBfCodeAsValuesString,
    );
    console.log(
      `Found ${countOfUnlinkedMandatees} mandatees that are not linked.`,
    );
    const uris = await getMandateUrisMissingLink(linkedBfCodeAsValuesString);
    const promises = uris.map((uri) =>
      linkInstances(uri.mandatarisUri, uri.toBeLinkedMandatarisUri),
    );

    try {
      console.log(`Creating link for ${uris.length} mandatees with uris`);
      console.log(JSON.stringify(uris));
      await Promise.all(promises);
    } catch (error) {
      throw new HttpError(
        `Something went rong while creating the link between ${uris.length} mandatees.`,
        500,
      );
    }
    running = false;
  },
});
