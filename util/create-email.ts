import { v4 as uuid } from 'uuid';
import { sparqlEscapeDateTime, sparqlEscapeString } from 'mu';
import { updateSudo } from '@lblod/mu-auth-sudo';

import { HttpError } from './http-error';

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
  let mandatarisRows = '';
  for (const mandataris of mandatarissen) {
    mandatarisRows += `
      <tr>
        <td style="padding: 8px">${mandataris.name}</td>
        <td style="padding: 8px">${mandataris.mandate}</td>
      </tr>
    `;
  }
  const from = sparqlEscapeString(
    EMAIL_FROM_MANDATARIS_WITHOUT_DECISION as string,
  );
  const to = sparqlEscapeString(emailTo);
  const htmlMessage = `
    <p>Beste,</p>
    <p>Er zijn een aantal mandatarissen die al meer dan 10 dagen actief zijn zonder dat er een koppeling met een besluit is gemaakt. Voor uw gemeente zijn dit er ${mandatarissen.length}.</p>
    <p> Hieronder vindt u een overzicht van al deze mandatarissen: <p>
    <table>
      <tr>
        <th style="text-align:left;padding:8px">Naam</th>
        <th style="text-align:left;padding:8px">Mandaat</th>
      </tr>
      ${mandatarisRows}
    </table>
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
    throw new HttpError(
      `Something went wrong while creating the email to ${to} for active mandatarissen without decision.`,
    );
  }
}
