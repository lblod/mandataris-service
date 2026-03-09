import { CronJob } from 'cron';

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
==================================================================
=                   CRON | LINKING OF MANDATEES                  =
==================================================================
`);
    running = false;
  },
});
