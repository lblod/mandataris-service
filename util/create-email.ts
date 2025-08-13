import { v4 as uuid } from 'uuid';
import { sparqlEscapeDateTime, sparqlEscapeString } from 'mu';
import { updateSudo } from '@lblod/mu-auth-sudo';

import { HttpError } from './http-error';

const SUBJECT_DECISION = 'Actieve mandatarissen zonder besluit';

const EMAIL_FROM_MANDATARIS_WITHOUT_DECISION =
  process.env.EMAIL_FROM_MANDATARIS_WITHOUT_DECISION;
export const SEND_EMAILS =
  process.env.SEND_EMAIL_FOR_MANDATARIS_WITHOUT_DECISION === 'true'
    ? true
    : false;

if (SEND_EMAILS && !EMAIL_FROM_MANDATARIS_WITHOUT_DECISION) {
  throw 'Please set the email adres to the value set in the LMB app EMAIL_FROM_MANDATARIS_WITHOUT_DECISION must equal to EMAIL_ADDRESS';
}
console.log(
  `EMAIL_FROM_MANDATARIS_WITHOUT_DECISION SET TO: ${EMAIL_FROM_MANDATARIS_WITHOUT_DECISION}`,
);
console.log(
  `SEND_EMAIL_FOR_MANDATARIS_WITHOUT_DECISION SET TO: ${SEND_EMAILS}`,
);

export async function sendMissingBekrachtigingsmail(
  emailTo: string,
  mandatarissen,
) {
  if (mandatarissen.length === 0) {
    return;
  }
  const mandatarisRows = [];
  for (const mandataris of mandatarissen) {
    mandatarisRows.push(`${mandataris.name} (${mandataris.mandate})`);
  }
  const from = sparqlEscapeString(
    EMAIL_FROM_MANDATARIS_WITHOUT_DECISION as string,
  );
  const to = sparqlEscapeString(emailTo);
  const plainTextMessage = `
Beste,

Voor bepaalde mandaten wordt verwacht dat er een besluit aan gekoppeld wordt dat het mandaat bekrachtigt.

Een aantal mandatarissen binnen je bestuur zijn al langer dan 10 dagen actief zijn zonder dat een besluit teruggevonden werd.
Deze mandaten hebben momenteel de publicatiestatus 'Niet bekrachtigd'.

Voor jouw bestuur gaat het om de volgende mandatarissen:

${mandatarisRows.join('\n')}

Je kan deze mandaten bekrachtigen via Lokaal Mandatenbeheer, een module van het Loket voor Lokale Besturen.

Meer informatie over de publicatiestatus en bekrachtiging van een mandaat kan je terugvinden in de handleiding voor Lokaal Mandatenbeheer.

Indien je hierover vragen hebt, kan je contact opnemen door op dit bericht te antwoorden.

Met vriendelijke groeten,

Agentschap Binnenlands Bestuur
`;

  const insertQuery = `
  PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/system/email> {
      <http://data.lblod.info/id/emails/${uuid()}> a nmo:Email;
        nmo:messageFrom ${from};
        nmo:emailTo ${to};
        nmo:messageSubject ${sparqlEscapeString(SUBJECT_DECISION)};
        nmo:plainTextMessageContent ${sparqlEscapeString(plainTextMessage)} ;
        nmo:sentDate ${sparqlEscapeDateTime(new Date())};
        nmo:isPartOf <http://data.lblod.info/id/mail-folders/2>.
    }
  }
  `;
  try {
    await updateSudo(insertQuery);
  } catch (error) {
    throw new HttpError(
      `Something went wrong while creating the email to ${to} for active mandatarissen without decision.`,
    );
  }
}
