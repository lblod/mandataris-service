import { HttpError } from '../util/http-error';
import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { getBooleanSparqlResult } from '../util/sparql-result';
import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeTermValue } from '../util/sparql-escape';

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

export async function checkDuplicateMandataris(mandatarisId, valueBindings) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    ASK {
      GRAPH ?g {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:holds ?currentMandaat ;
          mandaat:isBestuurlijkeAliasVan ?persoon.
        ?currentMandaat a mandaat:Mandaat ;
          org:role ?currentBestuursfunctie ;
          ^org:hasPost ?currentBestuursOrgaanIT .
        ?currentBestuursOrgaanIT ext:heeftBestuursperiode ?bestuursperiode ;
          mandaat:isTijdspecialisatieVan ?currentBestuursorgaan.
        ?currentBestuursorgaan besluit:bestuurt ?currentBestuurseenheid .
      }
      GRAPH ?h {
        ?linkedMandataris a mandaat:Mandataris ;
          org:holds ?linkedMandaat ;
          mandaat:isBestuurlijkeAliasVan ?persoon.
        ?linkedMandaat a mandaat:Mandaat ;
          org:role ?linkedBestuursfunctie ;
          ^org:hasPost ?linkedBestuursOrgaanIT .
        ?linkedBestuursOrgaanIT ext:heeftBestuursperiode ?bestuursperiode ;
          mandaat:isTijdspecialisatieVan ?linkedBestuursorgaan.
        ?linkedBestuursorgaan besluit:bestuurt ?linkedBestuurseenheid .
      }
      GRAPH ?public {
        ?currentBestuurseenheid besluit:werkingsgebied ?werkingsgebied .
        ?linkedBestuurseenheid besluit:werkingsgebied ?werkingsgebied .
      }
      VALUES (?currentBestuursfunctie ?linkedBestuursfunctie) {
        ${valueBindings}
      }
    }
  `;
  const result = await querySudo(q);
  return getBooleanSparqlResult(result);
}

export async function getDuplicateMandataris(
  mandatarisId,
  destinationGraph,
  valueBindings,
) {
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    SELECT DISTINCT ?linkedMandatarisUri ?linkedMandatarisId WHERE {
      GRAPH ?g {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:holds ?currentMandaat ;
          mandaat:isBestuurlijkeAliasVan ?persoon.
        ?currentMandaat a mandaat:Mandaat ;
          org:role ?currentBestuursfunctie ;
          ^org:hasPost ?currentBestuursOrgaanIT .
        ?currentBestuursOrgaanIT ext:heeftBestuursperiode ?bestuursperiode .
      }
      GRAPH ${sparqlEscapeTermValue(destinationGraph)} {
        ?linkedMandatarisUri a mandaat:Mandataris ;
          mu:uuid ?linkedMandatarisId ;
          org:holds ?linkedMandaat ;
          mandaat:isBestuurlijkeAliasVan ?persoon.
        ?linkedMandaat a mandaat:Mandaat ;
          org:role ?linkedBestuursfunctie ;
          ^org:hasPost ?linkedBestuursOrgaanIT .
        ?linkedBestuursOrgaanIT ext:heeftBestuursperiode ?bestuursperiode .
      }
      VALUES (?currentBestuursfunctie ?linkedBestuursfunctie) {
        ${valueBindings}
      }
    }
    LIMIT 1
  `;
  const result = await querySudo(q);

  if (result.results.bindings.length == 0) {
    return null;
  }

  return {
    uri: result.results.bindings[0].linkedMandatarisUri,
    id: result.results.bindings[0].linkedMandatarisId,
  };
}

export async function getDestinationGraphLinkedMandataris(
  mandatarisId,
  valueBindings,
) {
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

async function isOnafhankelijk(mandatarisId: string): Promise<boolean> {
  const getQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    ASK {
      ?currentMandataris a mandaat:Mandataris ;
        mu:uuid ${sparqlEscapeString(mandatarisId)} ;
        org:hasMembership ?lidmaatschap .
        ?lidmaatschap org:organisation ?fractie .
        ?fractie ext:isFractietype <http://data.vlaanderen.be/id/concept/Fractietype/Onafhankelijk> .
    }
  `;

  const sparqlResult = await query(getQuery);

  return getBooleanSparqlResult(sparqlResult);
}

export async function sameFractieName(ogMandatarisId, linkedMandataris) {
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
          ext:isFractieType <http://data.vlaanderen.be/id/concept/Fractietype/Samenwerkingsverband>
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

export async function copyFractieOfMandataris(mandatarisId, graph) {
  const fractieUuid = uuidv4();
  const fractieUri = `http://data.lblod.info/id/fracties/${fractieUuid}`;
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>

    INSERT {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ${sparqlEscapeUri(fractieUri)} ?p ?o ;
          mu:uuid ${sparqlEscapeString(fractieUuid)} ;
          org:memberOf ?linkedBestuursorgaanIT ;
          org:linkedTo ?linkedBestuurseenheid .
      }
    }
    WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:hasMembership ?lidmaatschap .
        ?lidmaatschap org:organisation ?fractie .
        ?fractie ?p ?o ;
          org:memberOf ?currentBestuursorgaanIT .
        ?currentBestuursorgaanIT ext:heeftBestuursperiode ?bestuursperiode .
      }

      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?linkedBestuursorgaanIT ext:heeftBestuursperiode ?bestuursperiode ;
          mandaat:isTijdspecialisatieVan ?linkedBestuursorgaan .
        ?linkedBestuursorgaan besluit:bestuurt ?linkedBestuurseenheid .
      }

      FILTER (?p NOT IN (mu:uuid, org:memberOf, org:linkedTo, dct:modified))

      FILTER NOT EXISTS {
        ?origin a <http://mu.semte.ch/vocabularies/ext/FormHistory>
      }
    }`;

  try {
    await updateSudo(q);
  } catch (error) {
    throw new HttpError(
      `Error occurred while trying to copy fractie of mandataris ${mandatarisId} to graph ${graph}`,
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
  const membershipUuid = uuidv4();
  const membershipUri = `http://data.lblod.info/id/lidmaatschappen/${membershipUuid}`;

  const escaped = {
    current: sparqlEscapeString(mandatarisId),
    linked: sparqlEscapeTermValue(linkedMandataris),
    fractie: sparqlEscapeUri(fractie),
    membershipUri: sparqlEscapeUri(membershipUri),
    membershipId: sparqlEscapeString(membershipUuid),
    graph: sparqlEscapeTermValue(graph),
  };

  const q = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>

    DELETE {
      GRAPH ${escaped.graph} {
        ${escaped.linked} org:hasMembership ?linkedMembership .
        ?linkedMembership ?linkedMemberP ?linkedMemberO .
      }
    }
    INSERT {
      GRAPH ${escaped.graph} {
        ${escaped.linked} org:hasMembership ${escaped.membershipUri} .
        ${escaped.membershipUri} ?ogMemberP ?ogMemberO ;
          mu:uuid ${escaped.membershipId} ;
          org:organisation ${escaped.fractie} .
      }
    }
    WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:hasMembership ?ogMembership .
        ?ogMembership ?ogMemberP ?ogMemberO .
      }
      GRAPH ${escaped.graph} {
        ${escaped.linked} a mandaat:Mandataris ;
          org:hasMembership ?linkedMembership .
        ?linkedMembership ?linkedMemberP ?linkedMemberO .
      }

      FILTER (?ogMemberP NOT IN (mu:uuid, org:organisation, dct:modified))
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

export async function copyMandataris(
  mandatarisId,
  fractie,
  graph,
  valueBindings,
) {
  const newMandatarisUuid = uuidv4();
  const newMandatarisUri = `http://data.lblod.info/id/mandatarissen/${newMandatarisUuid}`;
  const membershipUuid = uuidv4();
  const membershipUri = `http://data.lblod.info/id/lidmaatschappen/${membershipUuid}`;
  const q = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX regorg: <https://www.w3.org/ns/regorg#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX dct: <http://purl.org/dc/terms/>

    INSERT {
      GRAPH ${sparqlEscapeTermValue(graph)} {
        ${sparqlEscapeUri(newMandatarisUri)} a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(newMandatarisUuid)} ;
          org:holds ?linkedMandaat ;
          extlmb:hasPublicationStatus <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/588ce330-4abb-4448-9776-a17d9305df07> ;
          org:hasMembership ${sparqlEscapeUri(membershipUri)} ;
          ?mandatarisp ?mandatariso .
        ${sparqlEscapeUri(membershipUri)} ?memberp ?membero ;
          mu:uuid ${sparqlEscapeString(membershipUuid)} ;
          org:organisation ${sparqlEscapeUri(fractie)} .
      }
    }
    WHERE {
      GRAPH ?origin {
        ?currentMandataris a mandaat:Mandataris ;
          mu:uuid ${sparqlEscapeString(mandatarisId)} ;
          org:holds ?currentMandaat ;
          org:hasMembership ?membership ;
          ?mandatarisp ?mandatariso .
        ?currentMandaat a mandaat:Mandaat ;
          org:role ?currentBestuursfunctie ;
          ^org:hasPost ?currentBestuursOrgaanIT .
        ?currentBestuursOrgaanIT ext:heeftBestuursperiode ?bestuursperiode .
        ?membership ?memberp ?membero .
      }

      GRAPH ${sparqlEscapeTermValue(graph)} {
        ?linkedMandaat a mandaat:Mandaat ;
          org:role ?linkedBestuursfunctie ;
          ^org:hasPost ?linkedBestuursOrgaanIT .
        ?linkedBestuursOrgaanIT ext:heeftBestuursperiode ?bestuursperiode .
      }

      VALUES (?currentBestuursfunctie ?linkedBestuursfunctie) {
        ${valueBindings}
      }

      FILTER (?mandatarisp NOT IN (mu:uuid, org:holds, mandaat:rangorde, ext:linkToBesluit, mandaat:isTijdelijkVervangenDoor, mandaat:beleidsdomein, org:hasMembership, extlmb:hasPublicationStatus, dct:modified))
      FILTER (?memberp NOT IN (mu:uuid, org:organisation, dct:modified))
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
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX extlmb: <http://mu.semte.ch/vocabularies/ext/lmb/>

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
      FILTER (?mandatarisP NOT IN (mu:uuid, org:holds, mandaat:isBestuurlijkeAliasVan, mandaat:rangorde, ext:linkToBesluit, mandaat:isTijdelijkVervangenDoor, mandaat:beleidsdomein, org:hasMembership, extlmb:hasPublicationStatus))

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
