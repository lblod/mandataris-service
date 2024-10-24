import { Request, Response } from 'express';
import Router from 'express-promise-router';
import {
  query,
  update,
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeDateTime,
} from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeQueryBinding } from '../util/sparql-escape';
import {
  AANGEWEZEN_BURGEMEESTER_FUNCTIE_CODE,
  GEMEENTERAADSLID_FUNCTIE_CODE,
  LID_OCMW_FUNCTIE_CODE,
  LID_VB_FUNCTIE_CODE,
  SCHEPEN_FUNCTIE_CODE,
  VOORZITTER_GEMEENTERAAD_FUNCTIE_CODE,
  VOORZITTER_RMW_CODE,
  VOORZITTER_VB_FUNCTIE_CODE,
} from '../util/constants';

const installatievergaderingRouter = Router();

installatievergaderingRouter.post(
  '/copy-gemeente-to-ocmw-draft',
  async (req: Request, res: Response) => {
    const { gemeenteUri, ocmwUri } = req.body;
    await copyMunicipalityMandatarisInstancesToOCMW(gemeenteUri, ocmwUri);
    return res.status(200).send({ status: 'ok' });
  },
);

installatievergaderingRouter.post(
  '/:id/move-ocmw-organs/',
  async (req: Request, res: Response) => {
    const installatievergaderingId = req.params.id;
    const hasAccess = await canSeeInstallatievergadering(
      installatievergaderingId,
    );
    if (!hasAccess) {
      return res
        .status(404)
        .send({ error: 'Installatievergadering not found' });
    }
    await moveFracties(installatievergaderingId);
    await moveOcmwOrgans(installatievergaderingId);
    await movePersons(installatievergaderingId);
    await setLinkedIVToBehandeld(installatievergaderingId);
    return res.status(200).send({ status: 'ok' });
  },
);

async function canSeeInstallatievergadering(id: string) {
  const sparql = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

  SELECT * WHERE {
    ?s a lmb:Installatievergadering .
    ?s mu:uuid ${sparqlEscapeString(id)} .
  } LIMIT 1`;
  const result = await query(sparql);
  return result.results.bindings.length > 0;
}

async function moveFracties(installatievergaderingId: string) {
  const hasExistingFractions = await ocmwHasFractions(installatievergaderingId);
  if (hasExistingFractions) {
    console.log(
      `Cowardly refusing to create fractions for OCMW of ${installatievergaderingId} as it already has fracties`,
    );
    return;
  }
  const existingFractionsGemeente = await getExistingGemeenteFractions(
    installatievergaderingId,
  );

  const newFractions = existingFractionsGemeente.map((fraction) => {
    const uuid = uuidv4();
    const uri = `http://data.lblod.info/fracties/${uuid}`;
    return {
      uri,
      uuid,
      type:
        fraction.type ||
        'http://data.vlaanderen.be/id/concept/Fractietype/Samenwerkingsverband',
      name: fraction.name,
    };
  });

  const escapedId = sparqlEscapeString(installatievergaderingId);
  const valueBindings = newFractions
    .map(
      (fraction) =>
        `(${sparqlEscapeUri(fraction.uri)} ${sparqlEscapeString(
          fraction.uuid,
        )} ${sparqlEscapeUri(fraction.type)} ${sparqlEscapeString(
          fraction.name,
        )})`,
    )
    .join('\n');
  const insertSparql = `
  PREFIX mandaat:	<http://data.vlaanderen.be/ns/mandaat#>
  PREFIX besluit:	<http://data.vlaanderen.be/ns/besluit#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

  INSERT {
    GRAPH ?target {
      ?fractie a mandaat:Fractie.
      ?fractie mu:uuid ?uuid.
      ?fractie ext:isFractietype ?type.
      ?fractie regorg:legalName ?name.
      ?fractie org:memberOf ?realOrgT.
      ?fractie org:linkedTo ?realEenheid.
    }
  } WHERE {
    GRAPH ?origin {
      ?installatieVergadering lmb:heeftBestuursperiode ?period.
      ?installatieVergadering mu:uuid ${escapedId} .
      ?bestuursorgaan ext:origineleBestuursorgaan ?realOrgT.
    }
    GRAPH ?target {
        ?realOrgT mandaat:isTijdspecialisatieVan ?realOrg.
        ?realOrg besluit:bestuurt ?realEenheid.
    }
    VALUES (?fractie ?uuid ?type ?name) {
      ${valueBindings}
    }
    FILTER(?target != ?origin)
    FILTER NOT EXISTS {
      ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
    }
  }`;
  await updateSudo(insertSparql);
}

async function ocmwHasFractions(installatievergaderingId: string) {
  const escapedId = sparqlEscapeString(installatievergaderingId);
  const sparql = `
  PREFIX mandaat:	<http://data.vlaanderen.be/ns/mandaat#>
  PREFIX besluit:	<http://data.vlaanderen.be/ns/besluit#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

  SELECT DISTINCT ?target ?name WHERE {
    GRAPH ?origin {
      ?installatieVergadering lmb:heeftBestuursperiode ?period.
      ?installatieVergadering mu:uuid ${escapedId} .
      ?bestuursorgaan ext:origineleBestuursorgaan ?realOrg.
      ?bestuursorgaan mandaat:isTijdspecialisatieVan ?org.
      ?bestuursorgaan lmb:heeftBestuursperiode ?period.
    }
    GRAPH ?target {
      ?realOrg a ?type.
      ?fractie org:memberOf ?realOrg.
      ?fractie regorg:legalName ?name.
    }
    FILTER(?target != ?origin)
    FILTER NOT EXISTS {
      ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
    }
  } LIMIT 1`;
  const result = await querySudo(sparql);
  return result.results.bindings.length > 0;
}

async function getExistingGemeenteFractions(installatieVergaderingId: string) {
  const escapedId = sparqlEscapeString(installatieVergaderingId);
  const sparql = `PREFIX mandaat:	<http://data.vlaanderen.be/ns/mandaat#>
  PREFIX besluit:	<http://data.vlaanderen.be/ns/besluit#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

  SELECT DISTINCT ?fractie ?name ?type WHERE {
    GRAPH ?origin {
      ?installatieVergadering lmb:heeftBestuursperiode ?period.
      ?installatieVergadering mu:uuid ${escapedId} .
      ?bestuursorgaan ext:origineleBestuursorgaan ?realOrg.
      ?bestuursorgaan mandaat:isTijdspecialisatieVan ?org.
      ?fractie org:memberOf ?bestuursorgaan.
      ?fractie regorg:legalName ?name.
      OPTIONAL {
        ?fractie ext:isFractietype ?type.
      }
      ?bestuursorgaan lmb:heeftBestuursperiode ?period.
    }
    FILTER NOT EXISTS {
      ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
    }
  }`;

  const result = await querySudo(sparql);
  return result.results.bindings.map((binding) => {
    return {
      uri: binding.fractie.value,
      name: binding.name.value,
      type: binding.type?.value,
    };
  });
}

async function moveOcmwOrgans(installatievergaderingId: string) {
  await moveMandatarisesWithFractions(installatievergaderingId);
  await moveMandatarisesWithoutFractions(installatievergaderingId);
}

async function moveMandatarisesWithFractions(installatievergaderingId: string) {
  const escapedId = sparqlEscapeString(installatievergaderingId);
  const sparql = `
    PREFIX mandaat:	<http://data.vlaanderen.be/ns/mandaat#>
    PREFIX besluit:	<http://data.vlaanderen.be/ns/besluit#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    INSERT {
      GRAPH ?target {
        ?mandataris ?p ?o.
        ?membership ?mp ?mo.
        ?membership org:organisation ?realFractie.
      }
    } WHERE {
      GRAPH ?origin {
        ?installatieVergadering lmb:heeftBestuursperiode ?period.
        ?installatieVergadering mu:uuid ${escapedId} .
        ?bestuursorgaanT ext:origineleBestuursorgaan ?realOrgT.
        ?bestuursorgaanT lmb:heeftBestuursperiode ?period.
        ?bestuursorgaanT org:hasPost ?mandaat.
        ?mandataris org:holds ?mandaat.
        ?mandataris ?p ?o.
        ?mandataris org:hasMembership ?membership.
        ?membership ?mp ?mo.
        FILTER(?mp != org:organisation)
        ?membership org:organisation ?fractie.
        ?fractie regorg:legalName ?name.
      }
      GRAPH ?target {
        ?realOrgT mandaat:isTijdspecialisatieVan ?thing.
        ?realFractie org:memberOf ?realOrgT.
        ?realFractie regorg:legalName ?name.
      }
      FILTER(?target != ?origin)
      FILTER NOT EXISTS {
        ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }`;
  await updateSudo(sparql);
}

async function moveMandatarisesWithoutFractions(
  installatievergaderingId: string,
) {
  const escapedId = sparqlEscapeString(installatievergaderingId);
  const sparql = `
    PREFIX mandaat:	<http://data.vlaanderen.be/ns/mandaat#>
    PREFIX besluit:	<http://data.vlaanderen.be/ns/besluit#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    INSERT {
      GRAPH ?target {
        ?mandataris ?p ?o.
      }
    } WHERE {
      GRAPH ?origin {
        ?installatieVergadering lmb:heeftBestuursperiode ?period.
        ?installatieVergadering mu:uuid ${escapedId} .
        ?bestuursorgaanT ext:origineleBestuursorgaan ?realOrgT.
        ?bestuursorgaanT lmb:heeftBestuursperiode ?period.
        ?bestuursorgaanT org:hasPost ?mandaat.
        ?mandataris org:holds ?mandaat.
        ?mandataris ?p ?o.
        FILTER NOT EXISTS {
          ?mandataris org:hasMembership ?membership.
          ?membership a org:Membership.
        }
      }
      GRAPH ?target {
        ?realOrgT mandaat:isTijdspecialisatieVan ?thing.
      }
      FILTER(?target != ?origin)
      FILTER NOT EXISTS {
        ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }`;
  await updateSudo(sparql);
}

async function movePersons(installatievergaderingId: string) {
  const escapedId = sparqlEscapeString(installatievergaderingId);
  const sparql = `

  PREFIX mandaat:     <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX besluit:     <http://data.vlaanderen.be/ns/besluit#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

  INSERT {
    GRAPH ?target {
      ?person ?p ?o.
      ?related ?relatedp ?relatedo.
    }
  } WHERE {
    ?installatieVergadering mu:uuid ${escapedId} .
    ?installatieVergadering lmb:heeftBestuursperiode ?period.
    ?bestuursorgaanT lmb:heeftBestuursperiode ?period.
    ?bestuursorgaanT ext:origineleBestuursorgaan ?realOrg.
    GRAPH ?target {
      ?realOrg org:hasPost ?mandaat.
    }
    ?mandataris org:holds ?mandaat.
    ?mandataris mandaat:isBestuurlijkeAliasVan ?person.
    GRAPH ?origin {
      ?person ?p ?o.
      OPTIONAL {
        ?person ?relation ?related.
        VALUES ?relation {
          persoon:heeftGeboorte
          adms:identifier
        }
        ?related ?relatedp ?relatedo.
      }
    }
    FILTER NOT EXISTS {
      ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
    }
  }`;
  await updateSudo(sparql);
}

async function copyMunicipalityMandatarisInstancesToOCMW(
  orgaanItFrom: string,
  orgaanItTo: string,
) {
  await clearMandatarisInstancesFromOrgaan(orgaanItTo);
  await constructNewMandatarisInstances(orgaanItFrom, orgaanItTo);
}

type SimpleTriple = {
  subject: string;
  predicate: string;
  object: { value: string; type: string; datatype: string };
};

async function constructNewMandatarisInstances(
  orgaanItFrom: string,
  orgaanItTo: string,
) {
  const triples = await constructNewMandatarisInstancesWithOldUris(
    orgaanItFrom,
    orgaanItTo,
  );
  const { newTriples: transformedTriples, mandatarisLinks } =
    transformToNewMandatarisAndMembershipTriples(triples);

  await insertTransformedTriples(transformedTriples);
  await insertMandatarisLinks(mandatarisLinks);
}

async function constructNewMandatarisInstancesWithOldUris(
  orgaanItFrom: string,
  orgaanItTo: string,
): Promise<SimpleTriple[]> {
  const bestuursfunctieCodeMapping: { [key: string]: string } = {
    [GEMEENTERAADSLID_FUNCTIE_CODE]: LID_OCMW_FUNCTIE_CODE,
    [VOORZITTER_GEMEENTERAAD_FUNCTIE_CODE]: VOORZITTER_RMW_CODE,
    [SCHEPEN_FUNCTIE_CODE]: LID_VB_FUNCTIE_CODE,
    [AANGEWEZEN_BURGEMEESTER_FUNCTIE_CODE]: VOORZITTER_VB_FUNCTIE_CODE,
  };

  const mappingUris = Object.keys(bestuursfunctieCodeMapping)
    .map((from) => {
      return `(${sparqlEscapeUri(from)} ${sparqlEscapeUri(
        bestuursfunctieCodeMapping[from],
      )})`;
    })
    .join('\n');

  const sparql = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    CONSTRUCT {
      ?mandataris ?p ?o.
      ?mandataris org:holds ?mandaatTo.
      ?mandataris org:hasMembership ?newMembership.
      ?membership ?mp ?mo.
    } WHERE {
      VALUES ?orgaanFromId {
        ${sparqlEscapeString(orgaanItFrom)}
      }
      VALUES ?bestuursorgaanToId {
        ${sparqlEscapeString(orgaanItTo)}
      }
      ?orgaanFrom mu:uuid ?orgaanFromId.
      ?orgaanTo mu:uuid ?bestuursorgaanToId.

      VALUES (?mandaatCodeFrom ?mandaatCodeTo) {
        ${mappingUris}
      }

      ?orgaanFrom org:hasPost ?mandaat.
      ?mandataris org:holds ?mandaat.

      ?mandaat org:role ?mandaatCodeFrom.

      ?orgaanTo org:hasPost ?mandaatTo.
      ?mandaatTo org:role ?mandaatCodeTo.

      ?mandataris ?p ?o.
      FILTER(?p NOT IN (org:holds, mandaat:rangorde, mandaat:beleidsdomein))

      OPTIONAL {
        ?mandataris org:hasMembership ?membership.
        ?membership ?mp ?mo
      }
    }
  `;
  const result = await query(sparql);
  const triples = result.results.bindings.map((binding) => {
    return {
      subject: binding.s.value,
      predicate: binding.p.value,
      object: binding.o,
    };
  });
  return triples;
}

async function insertTransformedTriples(transformedTriples: SimpleTriple[]) {
  const formattedTriples = transformedTriples
    .map((triple) => {
      return `${sparqlEscapeUri(triple.subject)} ${sparqlEscapeUri(
        triple.predicate,
      )} ${sparqlEscapeQueryBinding(triple.object)} .`;
    })
    .join('\n');
  const insertSparql = `
    INSERT DATA {
      ${formattedTriples}
    }
  `;
  await update(insertSparql);
}

async function insertMandatarisLinks(mandatarisLinks) {
  const linkTriples = Object.keys(mandatarisLinks)
    .map((from) => {
      const to = mandatarisLinks[from];
      return `${sparqlEscapeUri(from)} ext:linked ${sparqlEscapeUri(to)}.`;
    })
    .join('\n');

  await updateSudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        ${linkTriples}
      }
    }`);
}

function transformToNewMandatarisAndMembershipTriples(triples: SimpleTriple[]) {
  // this is necessary because apparently generating nested uuids in a sparql query is not possible
  const { newUuids, mandatarisLinks } = generateNewInstanceIdsAndLinks(triples);

  const newTriples = triples.map((triple) => {
    const newUri = generateNewInstanceUri(
      triple.subject,
      newUuids,
      mandatarisLinks,
    );
    const objectUriIsTransformed = newUuids[triple.object.value];

    if (triple.predicate === 'http://mu.semte.ch/vocabularies/core/uuid') {
      // if the triple points to the uuid, replace the old one with the new one, using the new uri for the instance
      return {
        subject: newUri,
        predicate: triple.predicate,
        object: {
          value: newUuids[triple.subject],
          type: 'string',
          datatype: 'string',
        },
      };
    } else if (objectUriIsTransformed) {
      // if the object is also a uri of a transformed instance, change both the subject and the object to the new uri
      const newObjectUri = generateNewInstanceUri(
        triple.object.value,
        newUuids,
        mandatarisLinks,
      );

      return {
        subject: newUri,
        predicate: triple.predicate,
        object: {
          value: newObjectUri,
          type: 'uri',
          datatype: 'uri',
        },
      };
    } else {
      // by default, keep the existing value, but change the subject to the new uri
      return {
        subject: newUri,
        predicate: triple.predicate,
        object: triple.object,
      };
    }
  });
  return { newTriples, mandatarisLinks };
}

function generateNewInstanceUri(
  oldUri: string,
  newUuids: { [key: string]: string },
  mandatarisLinks: { [key: string]: string },
) {
  const isMandataris = mandatarisLinks[oldUri];
  const newUri = isMandataris
    ? `http://data.lblod.info/id/mandatarissen/${newUuids[oldUri]}`
    : `http://data.lblod.info/id/lidmaatschappen/${newUuids[oldUri]}`;
  return newUri;
}

function generateNewInstanceIdsAndLinks(triples: SimpleTriple[]) {
  const newUuids = {};
  const mandatarisLinks = {};

  triples.forEach((triple) => {
    if (
      triple.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    ) {
      newUuids[triple.subject] = uuidv4();

      if (
        triple.object.value ===
        'http://data.vlaanderen.be/ns/mandaat#Mandataris'
      ) {
        mandatarisLinks[triple.subject] =
          `http://data.lblod.info/id/mandatarissen/${newUuids[triple.subject]}`;
      }
    }
  });
  return {
    newUuids,
    mandatarisLinks,
  };
}

async function clearMandatarisInstancesFromOrgaan(orgaanIt: string) {
  const now = new Date();
  const sparql = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX astreams: <http://www.w3.org/ns/activitystreams#>
    DELETE {
        ?mandataris ?p ?o.
        ?membership ?mp ?mo.
    }
    INSERT {
      ?mandataris a astreams:Tombstone;
        astreams:deleted ${sparqlEscapeDateTime(now)} ;
        astreams:formerType mandaat:Mandataris .
      ?membership a astreams:Tombstone;
        astreams:deleted ${sparqlEscapeDateTime(now)} ;
        astreams:formerType org:Membership .
    }
     WHERE {
        VALUES ?orgaanId {
          ${sparqlEscapeString(orgaanIt)}
        }
        ?orgaan mu:uuid ?orgaanId.
        ?orgaan org:hasPost ?mandaat.
        ?mandataris org:holds ?mandaat;
          ?p ?o.
        OPTIONAL {
          ?mandataris org:hasMembership ?membership.
          ?membership ?mp ?mo.
        }
    }
  `;
  await update(sparql);
}

async function setLinkedIVToBehandeld(installatievergaderingId: string) {
  const escapedId = sparqlEscapeString(installatievergaderingId);
  const sparql = `

  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
  PREFIX ivs: <http://data.lblod.info/id/concept/InstallatievergaderingStatus/>

  DELETE {
    GRAPH ?target {
      ?ivOCMW lmb:hasStatus ?status .
    }
  }
  INSERT {
    GRAPH ?target {
      ?ivOCMW lmb:hasStatus ivs:c9fc3292-1576-4a82-8dcd-60795e22131f .
    }
  } WHERE {
    GRAPH ?origin {
      ?iv mu:uuid ${escapedId} .
      ?iv lmb:heeftBestuursperiode ?period .
      ?bestuursorgaanIT lmb:heeftBestuursperiode ?period .
      ?bestuursorgaanIT ext:origineleBestuursorgaan ?realOrg .
    }
    GRAPH ?target {
      ?realOrg a ?type .
      ?ivOCMW lmb:heeftBestuursperiode ?period .
      ?ivOCMW lmb:hasStatus ?status .
    }
    FILTER(?target != ?origin)
    FILTER NOT EXISTS {
      ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
    }
  }`;
  await updateSudo(sparql);
}

export { installatievergaderingRouter };
