import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeString, sparqlEscapeUri } from 'mu';

import { BASE_RESOURCE, FRACTIE_TYPE } from '../util/constants';
import { getSparqlResults } from '../util/sparql-result';

export const fractie = {
  createOnafhankelijkeFractie,
  getForPerson,
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
  const bestuursorgaanForGraph = sparqlEscapeUri(bestuursorganenInTijd.at(0));
  const createQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ?bestuursOrgaanGraph {
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
        ${bestuursorgaanForGraph} a besluit:Bestuursorgaan.
      }
      
      BIND (?graph AS ?bestuursOrgaanGraph).
    }
  `;

  await updateSudo(createQuery);

  return uri;
}

async function getForPerson(
  persoonId: string,
  mandaatUri: string,
): Promise<Array<string>> {
  const persoon = sparqlEscapeString(persoonId);
  const mandaat = sparqlEscapeUri(mandaatUri);
  const getAllQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?fractie
    WHERE {
        GRAPH ?persoonGraph {
          ?mandataris a mandaat:Mandataris;
            mandaat:isBestuurlijkeAliasVan ?person;
            org:holds ${mandaat};
            org:hasMembership ?member.
            ?person mu:uuid ${persoon}.
            ?member org:organisation ?fractie.
        }

    }
  `;
  const results = await querySudo(getAllQuery);

  return getSparqlResults(results).map((binding) => binding.fractie.value);
}
