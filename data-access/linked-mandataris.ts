import { HttpError } from '../util/http-error';
import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { getBooleanSparqlResult } from '../util/sparql-result';
import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeTermValue } from '../util/sparql-escape';
import { Term } from '../types';

export async function canAccessMandataris(id: string) {
  const sparql = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT * WHERE {
      ?mandataris a mandaat:Mandataris ;
        mu:uuid ${sparqlEscapeString(id)} .
    } LIMIT 1`;
  const result = await query(sparql);
  return result.results.bindings.length > 0;
}

export async function findLinkedMandate(mandatarisId, valueBindings) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT DISTINCT ?currentMandaatLabel ?linkedMandaatLabel WHERE {
      GRAPH ?g {
        ?mandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:holds ?mandaat .
        ?mandaat a mandaat:Mandaat ;
          org:role ?currentBestuursfunctie .
      }
      GRAPH ?h {
        ?currentBestuursfunctie skos:prefLabel ?currentMandaatLabel .
      }
      OPTIONAL {
        VALUES (?currentBestuursfunctie ?linkedBestuursfunctie) {
          ${valueBindings}
        }
        ?linkedBestuursfunctie skos:prefLabel ?linkedMandaatLabel .
      }
    }
    LIMIT 1
  `;
  const result = await querySudo(q);
  if (result.results.bindings.length == 0) {
    return null;
  }
  return {
    currentMandate: result.results.bindings[0].currentMandaatLabel.value,
    duplicateMandate: result.results.bindings[0].linkedMandaatLabel?.value,
  };
}

export async function getDestinationGraphLinkedMandataris(
  mandatarisId,
  valueBindings,
): Promise<Term | null> {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?dest WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:holds ?currentMandaat .
        ?currentMandaat a mandaat:Mandaat ;
          ^org:hasPost ?currentBestuursOrgaanIT .
        ?currentBestuursOrgaanIT mandaat:isTijdspecialisatieVan ?currentBestuursorgaan.
        ?currentBestuursorgaan besluit:bestuurt ?currentBestuurseenheid .
      }

      GRAPH ?dest {
        ?linkedBestuursorgaan besluit:bestuurt ?linkedBestuurseenheid .
      }

      FILTER NOT EXISTS {
        # these are fake ones created by the preparation of the legislature
        ?linkedBestuursorgaan ext:origineleBestuurseenheid ?_something .
      }
      # the other eenheid should not be our own because that apparently happens sometimes
      FILTER(?linkedBestuurseenheid != ?currentBestuurseenheid)

      GRAPH ?g {
        ?currentBestuurseenheid besluit:werkingsgebied ?werkingsgebied ;
          besluit:classificatie ?currentClassifiactie .
        ?linkedBestuurseenheid besluit:werkingsgebied ?werkingsgebied ;
          besluit:classificatie ?linkedClassificatie .
      }
      VALUES (?currentClassificate ?linkedClassificatie) {
        ${valueBindings}
      }
    }
    LIMIT 1
  `;

  const result = await querySudo(q);
  if (result.results.bindings.length == 0) {
    return null;
  }
  return result.results.bindings[0].dest;
}

export async function linkedMandateAlreadyExists(
  mandatarisId,
  graph,
  valueBindings,
) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    ASK WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:holds ?currentMandaat ;
          mandaat:isBestuurlijkeAliasVan ?person .

        ?currentMandaat a mandaat:Mandaat ;
          org:role ?currentBestuursfunctie ;
          ^org:hasPost ?currentBestuursOrgaanIT .
        ?currentBestuursOrgaanIT lmb:heeftBestuursperiode ?bestuursperiode .
      }

      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?linkedMandataris a mandaat:Mandataris ;
          org:holds ?linkedMandaat ;
          mandaat:isBestuurlijkeAliasVan ?person .
        ?linkedMandaat a mandaat:Mandaat ;
          org:role ?linkedBestuursfunctie ;
          ^org:hasPost ?linkedBestuursOrgaanIT .
        ?linkedBestuursOrgaanIT lmb:heeftBestuursperiode ?bestuursperiode .
      }

      VALUES (?currentBestuursfunctie ?linkedBestuursfunctie) {
        ${valueBindings}
      }
    }
    `;

  const result = await querySudo(q);
  return getBooleanSparqlResult(result);
}

export async function findPersonForMandataris(mandatarisId) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    SELECT ?person
    WHERE {
      GRAPH ?g {
        ?mandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          mandaat:isBestuurlijkeAliasVan ?person .
      }
    }
    LIMIT 1
  `;
  const result = await querySudo(q);
  if (result.results.bindings.length == 0) {
    return null;
  }
  return result.results.bindings[0].person.value;
}

export async function personOfMandatarisExistsInGraph(mandatarisId, graph) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX person: <http://www.w3.org/ns/person#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    ASK {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          mandaat:isBestuurlijkeAliasVan ?persoon.
      }

      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?persoon a person:Person .
      }
    }
  `;

  const result = await querySudo(q);
  return getBooleanSparqlResult(result);
}

export async function copyPersonOfMandataris(mandatarisId, graph) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
    PREFIX adms: <http://www.w3.org/ns/adms#>

    INSERT {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?person ?p ?o .
        ?geboorte ?geboortep ?geboorteo .
        ?id ?idp ?ido .
      }
    }
    WHERE {
      GRAPH ?origin {
        ?mandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          mandaat:isBestuurlijkeAliasVan ?person .
        ?person ?p ?o .
        OPTIONAL {
          ?person persoon:heeftGeboorte ?geboorte .
          ?geboorte ?geboortep ?geboorteo .
        }
        OPTIONAL {
          ?person adms:identifier ?id .
          ?id ?idp ?ido .
        }
      }
      FILTER NOT EXISTS {
        ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }`;

  try {
    await updateSudo(q);
  } catch (error) {
    throw new HttpError(
      `Error occurred while trying to copy person of mandataris ${mandatarisId} to graph ${graph}`,
      500,
    );
  }
}

export async function isFractieNameEqual(ogMandatarisId, linkedMandataris) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>

    ASK {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(ogMandatarisId)} ;
          org:hasMembership ?currentLidmaatschap .
        ?currentLidmaatschap org:organisation ?currentFractie .
        ?currentFractie regorg:legalName ?fractieNaam .
      }

      GRAPH ?dest {
        ${sparqlEscapeTermValue(linkedMandataris)} a mandaat:Mandataris ;
          org:hasMembership ?linkedLidmaatschap .
        ?linkedLidmaatschap org:organisation ?linkedFractie .
        ?linkedFractie regorg:legalName ?fractieNaam .
      }

      FILTER NOT EXISTS {
        ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
      FILTER NOT EXISTS {
        ?dest a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }`;

  const result = await querySudo(q);
  return getBooleanSparqlResult(result);
}

export async function getFractieOfMandatarisInGraph(mandatarisId, graph) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?doelFractie WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:hasMembership ?lidmaatschap .
        ?lidmaatschap org:organisation ?fractie .
        ?fractie regorg:legalName ?fractieNaam ;
          ext:isFractietype <http://data.vlaanderen.be/id/concept/Fractietype/Samenwerkingsverband>
      }

      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?doelFractie a mandaat:Fractie ;
          regorg:legalName ?fractieNaam .
      }
    }
    LIMIT 1
  `;

  const result = await querySudo(q);
  if (result.results.bindings.length == 0) {
    return null;
  }
  return result.results.bindings[0].doelFractie.value;
}

export async function copyOnafhankelijkeFractieOfMandataris(
  mandatarisId,
  graph,
) {
  const fractieUuid = uuidv4();
  const fractieUri = `http://data.lblod.info/id/fracties/${fractieUuid}`;
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ${sparqlEscapeUri(fractieUri)} a mandaat:Fractie ;
          mu:uuid ${sparqlEscapeString(fractieUuid)} ;
          ext:isFractietype <http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk> ;
          regorg:legalName "Onafhankelijk" ;
          org:memberOf ?linkedBestuursorgaanIT ;
          org:linkedTo ?linkedBestuurseenheid .
      }
    }
    WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:hasMembership / org:organisation / org:memberOf / lmb:heeftBestuursperiode ?bestuursperiode .
      }

      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?linkedBestuursorgaanIT lmb:heeftBestuursperiode ?bestuursperiode ;
          mandaat:isTijdspecialisatieVan / besluit:bestuurt ?linkedBestuurseenheid .
      }

      FILTER NOT EXISTS {
        ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }`;

  try {
    await updateSudo(q);
  } catch (error) {
    throw new HttpError(
      `Error occurred while trying to copy fractie of mandataris ${mandatarisId} to graph ${graph.value}`,
      500,
    );
  }
  return fractieUri;
}

export async function replaceFractieOfMandataris(
  mandatarisId,
  linkedMandataris,
  fractie,
  graph,
) {
  const escaped = {
    current: sparqlEscapeString(mandatarisId),
    linked: sparqlEscapeTermValue(linkedMandataris),
    graph: sparqlEscapeTermValue(graph),
  };

  let insertFractieTriples = '';
  if (fractie) {
    const membershipUuid = uuidv4();
    const membershipUri = `http://data.lblod.info/id/lidmaatschappen/${membershipUuid}`;

    const escaped2 = {
      fractie: sparqlEscapeUri(fractie),
      membershipUri: sparqlEscapeUri(membershipUri),
      membershipId: sparqlEscapeString(membershipUuid),
    };
    insertFractieTriples = `
      INSERT {
        GRAPH ${escaped.graph} {
          ${escaped.linked} org:hasMembership ${escaped2.membershipUri} .
          ${escaped2.membershipUri} ?ogMemberP ?ogMemberO ;
            mu:uuid ${escaped2.membershipId} ;
            org:organisation ${escaped2.fractie} .
        }
      }
    `;
  }

  const q = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>

    DELETE {
      GRAPH ${escaped.graph} {
        ${escaped.linked} org:hasMembership ?linkedMembership .
        ?linkedMembership ?linkedMemberP ?linkedMemberO .
      }
    }
    ${insertFractieTriples}
    WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${escaped.current} ;
          org:hasMembership ?ogMembership .
        ?ogMembership ?ogMemberP ?ogMemberO .
      }
      GRAPH ${escaped.graph} {
        ${escaped.linked} a mandaat:Mandataris .
        OPTIONAL {
          ?currentMandataris org:hasMembership ?linkedMembership .
          ?linkedMembership ?linkedMemberP ?linkedMemberO .
        }
      }

      FILTER (?ogMemberP NOT IN (mu:uuid, org:organisation))
    }
    `;
  try {
    await updateSudo(q);
  } catch (error) {
    throw new HttpError(
      `Error occurred while trying to copy fractie of mandataris ${mandatarisId} to mandataris ${linkedMandataris.value}`,
      500,
    );
  }
}

export async function createNewLinkedMandataris(
  mandatarisId,
  fractie,
  graph,
  valueBindings,
) {
  const newMandatarisUuid = uuidv4();
  const newMandatarisUri = `http://data.lblod.info/id/mandatarissen/${newMandatarisUuid}`;
  const escaped = {
    mandatarisId: sparqlEscapeString(mandatarisId),
    newMandatarisUuid: sparqlEscapeString(newMandatarisUuid),
    newMandataris: sparqlEscapeUri(newMandatarisUri),
    graph: sparqlEscapeTermValue(graph),
  };
  let fractieTriples = '';
  if (fractie) {
    const membershipUuid = uuidv4();
    const membershipUri = `http://data.lblod.info/id/lidmaatschappen/${membershipUuid}`;
    const escaped2 = {
      membershipUuid: sparqlEscapeString(membershipUuid),
      membership: sparqlEscapeUri(membershipUri),
      fractie: sparqlEscapeUri(fractie),
    };
    fractieTriples = `
      ${escaped.newMandataris} org:hasMembership ${escaped2.membership} .
      ${escaped2.membership} ?memberp ?membero ;
        mu:uuid ${escaped2.membershipUuid} ;
        org:organisation ${escaped2.fractie} .
    `;
  }
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    INSERT {
      GRAPH ${escaped.graph} {
        ${escaped.newMandataris} a mandaat:Mandataris ;
          mu:uuid ${escaped.newMandatarisUuid} ;
          org:holds ?linkedMandaat ;
          lmb:hasPublicationStatus <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/588ce330-4abb-4448-9776-a17d9305df07> ;
          ?mandatarisp ?mandatariso .
        ${fractieTriples}
      }
    }
    WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${escaped.mandatarisId} ;
          org:holds ?currentMandaat ;
          org:hasMembership ?membership ;
          ?mandatarisp ?mandatariso .
        ?currentMandaat a mandaat:Mandaat ;
          org:role ?currentBestuursfunctie ;
          ^org:hasPost ?currentBestuursOrgaanIT .
        ?currentBestuursOrgaanIT lmb:heeftBestuursperiode ?bestuursperiode .
        ?membership ?memberp ?membero .
      }

      GRAPH ${escaped.graph} {
        ?linkedMandaat a mandaat:Mandaat ;
          org:role ?linkedBestuursfunctie ;
          ^org:hasPost ?linkedBestuursOrgaanIT .
        ?linkedBestuursOrgaanIT lmb:heeftBestuursperiode ?bestuursperiode .
      }

      VALUES (?currentBestuursfunctie ?linkedBestuursfunctie) {
        ${valueBindings}
      }

      FILTER (?mandatarisp NOT IN (mu:uuid, org:holds, mandaat:rangorde, lmb:linkToBesluit, mandaat:isTijdelijkVervangenDoor, mandaat:beleidsdomein, org:hasMembership, lmb:hasPublicationStatus))
      FILTER (?memberp NOT IN (mu:uuid, org:organisation, org:memberDuring))
    }
    `;

  try {
    await updateSudo(q);
  } catch (error) {
    throw new HttpError(
      `Error occurred while trying to create linked mandataris of ${mandatarisId} in graph ${graph}`,
      500,
    );
  }
  return { uri: newMandatarisUri, id: newMandatarisUuid };
}

export async function correctLinkedMandataris(mandatarisId, linkedMandataris) {
  const escaped = {
    current: sparqlEscapeString(mandatarisId),
    linked: sparqlEscapeTermValue(linkedMandataris),
  };
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    DELETE {
      GRAPH ?dest {
        ${escaped.linked} ?mandatarisP ?linkedMandatarisO .
      }
    }
    INSERT {
      GRAPH ?dest {
        ${escaped.linked} ?mandatarisP ?ogMandatarisO .
      }
    }
    WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${escaped.current} ;
          ?mandatarisP ?ogMandatarisO .
      }
      FILTER (?mandatarisP NOT IN (mu:uuid, org:holds, mandaat:isBestuurlijkeAliasVan, mandaat:rangorde, lmb:linkToBesluit, mandaat:isTijdelijkVervangenDoor, mandaat:beleidsdomein, org:hasMembership, lmb:hasPublicationStatus))

      GRAPH ?dest {
        ${escaped.linked} a mandaat:Mandataris .
      }
      OPTIONAL {
        GRAPH ?dest {
          ${escaped.linked} ?mandatarisP ?linkedMandatarisO .
        }
      }
      FILTER NOT EXISTS {
        ?dest a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
      FILTER NOT EXISTS {
        ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }
    `;

  try {
    await updateSudo(q);
  } catch (error) {
    throw new HttpError(
      `Error while trying to update linked mandataris ${linkedMandataris.value} with changes from mandataris ${mandatarisId}`,
      500,
    );
  }
}

export async function copyExtraValues(oldMandataris, newMandataris) {
  const escaped = {
    old: sparqlEscapeTermValue(oldMandataris),
    new: sparqlEscapeUri(newMandataris),
  };
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    INSERT {
      GRAPH ?graph {
        ${escaped.new} ?p ?o .
      }
    }
    WHERE {
      GRAPH ?graph {
        ${escaped.old} a mandaat:Mandataris ;
          ?p ?o .
      }
      FILTER NOT EXISTS {
        ${escaped.new} ?p ?newO .

      }
      FILTER NOT EXISTS {
        ?graph a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }
    `;

  try {
    await updateSudo(q);
  } catch (error) {
    throw new HttpError(
      `Error while trying to copy values from mandataris ${escaped.old} to mandataris ${escaped.new}`,
      500,
    );
  }
}

export async function linkInstances(instance1: string, instance2: string) {
  const insertQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        ?i1 ext:linked ?i2 .
      }
    }
    WHERE {
      GRAPH ?g {
        ?i1 mu:uuid ${sparqlEscapeString(instance1)} .
      }
      GRAPH ?h {
        ?i2 mu:uuid ${sparqlEscapeString(instance2)} .
      }
    }
  `;

  await updateSudo(insertQuery);
}

export async function unlinkInstance(instance: string) {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    DELETE {
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        ?i1 ext:linked ?i2 .
        ?i2 ext:linked ?i1 .
      }
    }
    WHERE {
      GRAPH ?g {
        ?i1 mu:uuid ${sparqlEscapeString(instance)} .
      }
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        {
          ?i1 ext:linked ?i2 .
        }
        UNION
        {
          ?i2 ext:linked ?i1 .
        }
      }
    }
  `;

  await updateSudo(query);
}

export async function findLinkedInstance(instance1: string) {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?i2Uri ?i2Id WHERE {
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        { ?i1 ext:linked ?i2Uri . } UNION { ?i2Uri ext:linked ?i1 . }
      }
      GRAPH ?g {
        ?i1 mu:uuid ${sparqlEscapeString(instance1)} .
      }
      GRAPH ?h {
        ?i2Uri mu:uuid ?i2Id .
      }
    }
    LIMIT 1
  `;

  const result = await querySudo(query);
  if (result.results.bindings.length == 0) {
    return null;
  }
  return {
    uri: result.results.bindings[0].i2Uri,
    id: result.results.bindings[0].i2Id,
  };
}
