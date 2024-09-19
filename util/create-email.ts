import { v4 as uuid } from 'uuid';
import { sparqlEscapeDateTime, sparqlEscapeString } from './mu';
import { updateSudo } from '@lblod/mu-auth-sudo';

const EMAIL_FROM_MANDATARIS_EFFECTIEF =
  process.env.EMAIL_FROM_MANDATARIS_EFFECTIEF ??
  'lokaal-mandatenbeheer@vlaanderen.be';

export async function sendMailTo(emailTo: string, mandatarisUri: string) {
  const from = sparqlEscapeString(EMAIL_FROM_MANDATARIS_EFFECTIEF);
  const to = sparqlEscapeString(emailTo);
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
        nmo:plainTextMessageContent "Mandataris met uri ${mandatarisUri} staat al 10 of meer dagen op publicatie status effectief zonder dat er een besluit aan hangt.";
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
