import { Request, Response } from 'express';
import Router from 'express-promise-router';
import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';

const installatievergaderingRouter = Router();

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
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

  SELECT * WHERE {
    ?s a ext:Installatievergadering .
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
      ?installatieVergadering ext:heeftBestuursperiode ?period.
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
  PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>

  SELECT DISTINCT ?target ?name WHERE {
    GRAPH ?origin {
      ?installatieVergadering ext:heeftBestuursperiode ?period.
      ?installatieVergadering mu:uuid ${escapedId} .
      ?bestuursorgaan ext:origineleBestuursorgaan ?realOrg.
      ?bestuursorgaan mandaat:isTijdspecialisatieVan ?org.
      ?bestuursorgaan ext:heeftBestuursperiode ?period.
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
  PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>

  SELECT DISTINCT ?fractie ?name ?type WHERE {
    GRAPH ?origin {
      ?installatieVergadering ext:heeftBestuursperiode ?period.
      ?installatieVergadering mu:uuid ${escapedId} .
      ?bestuursorgaan ext:origineleBestuursorgaan ?realOrg.
      ?bestuursorgaan mandaat:isTijdspecialisatieVan ?org.
      ?fractie org:memberOf ?bestuursorgaan.
      ?fractie regorg:legalName ?name.
      OPTIONAL {
        ?fractie ext:fractieType ?type.
      }
      ?bestuursorgaan ext:heeftBestuursperiode ?period.
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
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>

    INSERT {
      GRAPH ?target {
        ?mandataris ?p ?o.
        ?membership ?mp ?mo.
        ?membership org:organisation ?realFractie.
      }
    } WHERE {
      GRAPH ?origin {
        ?installatieVergadering ext:heeftBestuursperiode ?period.
        ?installatieVergadering mu:uuid ${escapedId} .
        ?bestuursorgaanT ext:origineleBestuursorgaan ?realOrgT.
        ?bestuursorgaanT ext:heeftBestuursperiode ?period.
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
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>

    INSERT {
      GRAPH ?target {
        ?mandataris ?p ?o.
      }
    } WHERE {
      GRAPH ?origin {
        ?installatieVergadering ext:heeftBestuursperiode ?period.
        ?installatieVergadering mu:uuid ${escapedId} .
        ?bestuursorgaanT ext:origineleBestuursorgaan ?realOrgT.
        ?bestuursorgaanT ext:heeftBestuursperiode ?period.
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
  PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
  PREFIX bestuurseenheidscode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>

  INSERT {
    GRAPH ?target {
      ?person ?p ?o.
      ?related ?relatedp ?relatedo.
    }
  } WHERE {
    ?installatieVergadering mu:uuid ${escapedId} .
    ?installatieVergadering ext:heeftBestuursperiode ?period.
    ?bestuursorgaanT ext:heeftBestuursperiode ?period.
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

export { installatievergaderingRouter };
