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
  const escapedBestuursorganenInTijd = bestuursorganenInTijd.map(
    (bestuursorgaanInTijd) => sparqlEscapeUri(bestuursorgaanInTijd),
  );
  const createQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ?bestuurseenheidGraph {
        ${sparqlEscapeUri(uri)} a mandaat:Fractie;
          mu:uuid ${sparqlEscapeString(fractieId)};
          regorg:legalName ${sparqlEscapeString('Onafhankelijk')};
          ext:isFractietype ${sparqlEscapeUri(FRACTIE_TYPE.ONAFHANKELIJK)};
          org:linkedTo ${sparqlEscapeUri(bestuurseenheid)};
          org:memberOf ${escapedBestuursorganenInTijd.join(', ')}.
      }
    }
    WHERE {
      GRAPH ?graph {
        ${sparqlEscapeUri(bestuurseenheid)} a besluit:Bestuurseenheid.
      }
      
      BIND (?graph AS ?bestuurseenheidGraph).
    }
  `;

  await updateSudo(createQuery);

  return uri;
}
