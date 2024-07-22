import { updateSudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeString, sparqlEscapeUri } from 'mu';

import { BASE_RESOURCE, FRACTIE_TYPE } from '../util/constants';

export const fractie = {
  createOnafhankelijkeFractie,
};

async function createOnafhankelijkeFractie(
  bestuursorganenInTijd: Array<string>,
  bestuurseenheid: string,
): Promise<string> {
  const fractieId = uuidv4();
  const uri = BASE_RESOURCE.FRACTIES + fractieId;
  const mappedBestuursorganenInTijd = bestuursorganenInTijd.map(
    (bestuursorgaanInTijd) => sparqlEscapeUri(bestuursorgaanInTijd),
  );
  const createQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    INSERT {
      GRAPH ?bestuurseenheidGraph {
        ${sparqlEscapeUri(uri)} a mandaat:Fractie;
          regorg:legalName ${sparqlEscapeString('Onafhankelijk')};
          ext:isFractietype ${sparqlEscapeUri(FRACTIE_TYPE.ONAFHANKELIJK)};
          org:linkedTo ${sparqlEscapeUri(bestuurseenheid)};
          org:memberOf ${mappedBestuursorganenInTijd.join(' ')}.
      }
    }
    WHERE {
      GRAPH ?bestuurseenheidGraph {
        ${sparqlEscapeUri(bestuurseenheid)} a besluit:Bestuurseenheid.
      }
    }
  `;

  const result = await updateSudo(createQuery);
  console.log(`RESULT:`, result);

  return 'id';
}
