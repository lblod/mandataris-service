import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import { BESLUIT_STAGING_GRAPH } from '../../data-access/mandatees-decisions';
import { MandatarisFullInfo } from '../../types';
import { createMandatarisBesluitNotification } from '../../util/create-notification';
import { sparqlEscapeString } from '../../util/mu';
import {
  findFirstSparqlResult,
  getBooleanSparqlResult,
} from '../../util/sparql-result';
import { getUuidForUri } from '../../util/uuid-for-uri';

export async function copyFractionInfo(mandatarisFullInfo: MandatarisFullInfo) {
  const nonExistingFractions =
    await checkForFractionsThatDontExist(mandatarisFullInfo);
  if (nonExistingFractions) {
    return;
  }
  await updateFractionName(mandatarisFullInfo);
  const duplicateMemberships =
    await checkForDuplicateMemberships(mandatarisFullInfo);
  if (duplicateMemberships) {
    return;
  }
  await copyMembership(mandatarisFullInfo);
}

const checkForFractionsThatDontExist = async (
  mandatarisFullInfo: MandatarisFullInfo,
) => {
  const mandatarisUri = sparqlEscapeUri(mandatarisFullInfo.mandatarisUri);
  const graph = mandatarisFullInfo.graph;
  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    ASK WHERE {
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${mandatarisUri} org:hasMembership ?membership .
        ?membership org:organisation ?fractie .
      }
      FILTER NOT EXISTS {
        GRAPH ${sparqlEscapeUri(graph)} {
          ?fractie a mandaat:Fractie .
        }
      }
    }
  `;
  const result = await querySudo(query);
  const hasUnknownFractions = getBooleanSparqlResult(result);
  if (hasUnknownFractions) {
    await createMandatarisBesluitNotification({
      title: 'Onbekende fractie',
      description:
        'Mandataris uit een besluit heeft een fractie die niet gekend is in de applicatie. Deze informatie is niet overgezet. Gelieve de Mandataris manueel na te kijken en eventueel aan te passen.',
      type: 'error',
      info: mandatarisFullInfo,
    });
    return true;
  } else {
    return false;
  }
};

const updateFractionName = async (mandatarisFullInfo: MandatarisFullInfo) => {
  const mandatarisUri = sparqlEscapeUri(mandatarisFullInfo.mandatarisUri);
  const graph = sparqlEscapeUri(mandatarisFullInfo.graph);
  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>

    DELETE {
      GRAPH ${graph} {
        ?fractie regorg:legalName ?oldName .
      }
    }
    INSERT {
      GRAPH ${graph} {
        ?fractie regorg:legalName ?name .
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${mandatarisUri} org:hasMembership ?membership .
        ?membership org:organisation ?fractie .
        ?fractie regorg:legalName ?name .
      }
      GRAPH ${graph} {
        ?fractie regorg:legalName ?oldName .
      }
      FILTER(?oldName != ?name)
    }
  `;
  await querySudo(query);
};

const checkForDuplicateMemberships = async (
  mandatarisFullInfo: MandatarisFullInfo,
) => {
  const mandatarisUri = sparqlEscapeUri(mandatarisFullInfo.mandatarisUri);
  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    ASK WHERE {
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${mandatarisUri} org:hasMembership ?membership .
        ${mandatarisUri} org:hasMembership ?membership2 .
        FILTER(?membership != ?membership2)
      }
    }
  `;
  const result = await querySudo(query);
  const hasDuplicateFraction = getBooleanSparqlResult(result);
  if (hasDuplicateFraction) {
    await createMandatarisBesluitNotification({
      title: 'Dubbele fractie',
      description:
        'Een mandataris heeft meerdere fracties op hetzelfde moment in het besluit. Deze informatie is niet overgezet. Gelieve de Mandataris manueel na te kijken en eventueel aan te passen.',
      type: 'error',
      info: mandatarisFullInfo,
    });
    return true;
  } else {
    return false;
  }
};

const copyMembership = async (mandatarisFullInfo: MandatarisFullInfo) => {
  const hasNewMemberships =
    await hasMembershipsWithDifferences(mandatarisFullInfo);
  if (!hasNewMemberships) {
    // no different memberships specified. keep the original data
    return;
  }

  await removeOldMemberships(mandatarisFullInfo);
  await addNewMemberships(mandatarisFullInfo);
};

const hasMembershipsWithDifferences = async (
  mandatarisFullInfo: MandatarisFullInfo,
) => {
  const mandatarisUri = sparqlEscapeUri(mandatarisFullInfo.mandatarisUri);
  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    ASK WHERE {
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${mandatarisUri} org:hasMembership ?subject .
        ?subject org:organisation ?fractie .
      }
      FILTER NOT EXISTS {
        GRAPH ${sparqlEscapeUri(mandatarisFullInfo.graph)} {
          ?subject org:organisation ?fractie .
        }
      }
    }
  `;
  const result = await querySudo(query);
  return getBooleanSparqlResult(result);
};

const removeOldMemberships = async (mandatarisFullInfo: MandatarisFullInfo) => {
  const mandatarisUri = sparqlEscapeUri(mandatarisFullInfo.mandatarisUri);
  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    DELETE {
      GRAPH ${sparqlEscapeUri(mandatarisFullInfo.graph)} {
        ${mandatarisUri} org:hasMembership ?membership .
        ?membership ?p ?o .
        ?membership org:memberDuring ?interval.
        ?interval ?p2 ?o2 .
      }
    } WHERE {
      GRAPH ${sparqlEscapeUri(mandatarisFullInfo.graph)} {
        ${mandatarisUri} org:hasMembership ?membership .
        ?membership ?p ?o .
        OPTIONAL {
          ?membership org:memberDuring ?interval.
          ?interval ?p2 ?o2 .
        }
      }
    }
  `;
  await querySudo(query);
};

const addNewMemberships = async (mandatarisFullInfo: MandatarisFullInfo) => {
  const membershipUri = await getMembershipUri(
    mandatarisFullInfo.mandatarisUri,
  );
  const mandatarisUri = sparqlEscapeUri(mandatarisFullInfo.mandatarisUri);
  const graph = sparqlEscapeUri(mandatarisFullInfo.graph);
  if (!membershipUri) {
    return;
  }
  const id = await getUuidForUri(membershipUri, {
    allowCheckingUri: true,
    allowGenerateUuid: true,
  });

  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ${graph} {
        ${mandatarisUri} org:hasMembership ?membership .
        ?membership ?p ?o ;
          a org:Membership ;
          mu:uuid ${sparqlEscapeString(id)} .
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${mandatarisUri} org:hasMembership ?membership .
        ?membership ?p ?o .
      }
    }
  `;
  await querySudo(query);
};

const getMembershipUri = async (mandatarisUri: string) => {
  const query = `
    PREFIX org: <http://www.w3.org/ns/org#>
    SELECT ?membership WHERE {
      GRAPH ${sparqlEscapeUri(BESLUIT_STAGING_GRAPH)} {
        ${sparqlEscapeUri(mandatarisUri)} org:hasMembership ?membership .
      }
    }
  `;
  const result = await querySudo(query);
  const results = findFirstSparqlResult(result);
  return results?.membership?.value;
};
