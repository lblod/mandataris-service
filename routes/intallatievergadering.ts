import { Request, Response } from 'express';
import Router from 'express-promise-router';
import { query, update, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';

const installatievergaderingRouter = Router();

installatievergaderingRouter.post(
  `/copy-gemeente-to-ocmw-draft`,
  async (req: Request, res: Response) => {
    const { gemeenteUri, ocmwUri } = req.body;
    await constructNewMandatarisInstances(gemeenteUri, ocmwUri);
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
      ?fractie ext:fractieType ?type.
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
        ?fractie ext:fractieType ?type.
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

async function copyMandatarisInstances(
  orgaanItFrom: string,
  orgaanItTo: string,
) {
  await clearMandatarisInstancesFromOrgaan(orgaanItTo);
  // TODO untested, should just insert instead of construct
  const newInstances = await constructNewMandatarisInstances(
    orgaanItFrom,
    orgaanItTo,
  );
}

async function constructNewMandatarisInstances(
  orgaanItFrom: string,
  orgaanItTo: string,
) {
  // TODO test this
  const bestuursfunctieCodeMapping = {
    // gemeenteraadslid -> lid raad voor maatschappelijk welzijn
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000011':
      'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000015',
    // voorzitter gemeenteraad -> voorzitter raad voor maatschappelijk welzijn
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000012':
      'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000016',
    // schepen -> lid vast bureau
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000014':
      'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000017',
    // aangewezen burgemeester -> voorzitter vast bureau
    'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/7b038cc40bba10bec833ecfe6f15bc7a':
      'http://data.vlaanderen.be/id/concept/BestuursfunctieCode/5ab0e9b8a3b2ca7c5e000018',
  };

  const sparql = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core>

    CONSTRUCT {
      ?newMandataris ?p ?o.
      ?newMandataris mu:uuid ?mandatarisUuid.
      ?newMandataris org:holds ?mandaatTo.
      ?newMandataris org:hasMembership ?newMembership.
      ?newMembership ?mp ?mo.
      ?newMembership mu:uuid ?membershipUuid.
    } WHERE {
      VALUES ?orgaan {
        ${sparqlEscapeUri(orgaanItFrom)}
      }
      VALUES ?bestuursorgaanTo {
        ${sparqlEscapeUri(orgaanItTo)}
      }
      VALUES (?mandaatCodeFrom ?mandaatCodeTo) {
        ${Object.keys(bestuursfunctieCodeMapping).map((from) => {
          return `(${sparqlEscapeUri(from)} ${sparqlEscapeUri(
            bestuursfunctieCodeMapping[from],
          )})`;
        })}
      }

      BIND(STRUUID() as ?mandatarisUuid)
      BIND(IRI(CONCAT("http://data.lblod.info/id/mandatarissen/", ?mandatarisUuid)) as ?newMandataris)
      ?orgaan org:hasPost ?mandaat.
      ?mandataris org:holds ?mandaat.

      ?mandaat org:role ?mandaatCodeFrom.

      ?bestuursorgaanTo org:hasPost ?mandaatTo.
      ?mandaatTo org:role ?mandaatCodeTo.

      ?mandataris ?p ?o.
      FILTER(?p NOT IN (org:hasMembership, org:holds, mu:uuid))

      OPTIONAL {
        ?mandataris org:hasMembership ?membership.
        ?membership ?mp ?mo
        FILTER(?mp NOT IN (mu:uuid))
        BIND(IF(BOUND(?membership), STRUUID(), "") as ?membershipUuid)
        BIND(IRI(CONCAT("http://data.lblod.info/id/lidmaatschappen/", ?membershipUuid)) as ?newMembership)
      }
    }
  `;
  const result = await query(sparql);
}

async function clearMandatarisInstancesFromOrgaan(orgaanIt: string) {
  const sparql = `
    DELETE {
        ?mandataris ?p ?o.
        ?membership ?mp ?mo.
    } WHERE {
        VALUES ?orgaan {
          ${sparqlEscapeUri(orgaanIt)}
        }
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

export { installatievergaderingRouter };
