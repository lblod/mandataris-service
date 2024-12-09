import { v4 as uuid } from 'uuid';
import { sparqlEscapeDateTime, sparqlEscapeString } from './mu';
import { updateSudo } from '@lblod/mu-auth-sudo';

const EMAIL_FROM_MANDATARIS_EFFECTIEF =
  process.env.EMAIL_FROM_MANDATARIS_EFFECTIEF;
export const SEND_EMAILS =
  process.env.SEND_EMAIL_FOR_MANDATARIS_EFFECTIEF ?? false;

if (SEND_EMAILS && !EMAIL_FROM_MANDATARIS_EFFECTIEF) {
  throw 'Please set the email adres to the value set in the LMB app EMAIL_FROM_MANDATARIS_EFFECTIEF must equal to EMAIL_ADDRESS';
}
console.log(
  `EMAIL_FROM_MANDATARIS_EFFECTIEF SET TO: ${EMAIL_FROM_MANDATARIS_EFFECTIEF}`,
);
console.log(`SEND_EMAIL_FOR_MANDATARIS_EFFECTIEF SET TO: ${SEND_EMAILS}`);

export async function sendMailTo(emailTo: string, mandataris) {
  const from = sparqlEscapeString(EMAIL_FROM_MANDATARIS_EFFECTIEF as string);
  const to = sparqlEscapeString(emailTo);
  const htmlMessage = `
    <p>Beste,</p>
    <p>De mandataris ${mandataris.name} met mandaat ${mandataris.mandate} heeft al meer dan 10 dagen de publicatiestatus ‘Effectief’ zonder koppeling met een besluit.</p>
    <p>Gelieve het besluit te koppelen.</p>
    <br/>
    <p>Met vriendelijke groeten,</p>
    <p>Agentschap Binnenlands Bestuur</p>
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
        nmo:messageSubject "Besluit voor mandataris";
        nmo:htmlMessageContent ${sparqlEscapeString(htmlMessage)} ;
        nmo:sentDate ${sparqlEscapeDateTime(new Date())};
        nmo:isPartOf <http://data.lblod.info/id/mail-folders/2>.
    }
  }
  `;
  try {
    await updateSudo(insertQuery);
  } catch (error) {
    console.log(
      `Something went wrong when sending an email to ${to} for mandataris in effectief status without decision..`,
    );
  }
}
