import Router from 'express-promise-router';

import {
  query,
  update,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';

import { Request, Response } from 'express';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';
import { isValidId, RDF_TYPE } from '../util/valid-id';
import { sparqlEscapeQueryBinding } from '../util/sparql-escape';

const rangordeRouter = Router();

type RangordeDiff = {
  mandatarisId: string;
  rangorde: string;
};

rangordeRouter.post(
  '/update-rangordes/',
  async (req: Request, res: Response) => {
    const { mandatarissen, date } = req.body;

    try {
      if (req.query.asCorrection === 'true') {
        await correctRangorde(mandatarissen);
      } else {
        await updateRangorde(mandatarissen, date);
      }
      // give resources time to update its cache
      await new Promise((resolve) => setTimeout(resolve, 500));
      return res.status(200).send({ status: 'ok' });
    } catch (error) {
      const message =
        error.message ??
        'Something went wrong while executing an update of rangordes.';
      const statusCode = error.status ?? STATUS_CODE.INTERNAL_SERVER_ERROR;
      return res.status(statusCode).send({ message });
    }
  },
);

async function updateRangorde(mandatarissen: RangordeDiff[], date: Date) {
  if (!date) {
    throw new HttpError('No date provided', STATUS_CODE.BAD_REQUEST);
  }
  const { withoutRangorde, withRangorde } =
    await getMandatarissenWithoutRangorde(mandatarissen);

  if (withoutRangorde.length > 0) {
    await correctRangorde(withoutRangorde);
  }
  if (withRangorde.length > 0) {
    await endAndCreateMandatarissenForNewRangordes(withRangorde, date);
  }
}

async function endAndCreateMandatarissenForNewRangordes(
  mandatarissen: RangordeDiff[],
  date: Date,
) {
  await createNewMandatarissen(mandatarissen, date);
  await endAffectedMandatarissen(
    mandatarissen.map((value) => value.mandatarisId),
    date,
  );
}

async function createNewMandatarissen(
  mandatarissen: RangordeDiff[],
  date: Date,
) {
  const { quadsGroupedByGraph, mandatarisMapping } =
    await buildNewMandatarisQuads(mandatarissen);
  await insertQuads(quadsGroupedByGraph);
  await insertNewMandatarisData(mandatarissen, date, mandatarisMapping);
  await addNewMandatarisLinks(mandatarisMapping);
  await addMemberships(mandatarisMapping);
}

type QuadsGroupedByGraph = Record<
  string,
  {
    s: { value: string };
    p: { value: string };
    o: { value: string; type: string; datatype: string };
  }[]
>;

async function buildNewMandatarisQuads(mandatarissen: RangordeDiff[]) {
  const mandatarisMapping: Record<string, string> = {};
  const safeMandatarisIds = mandatarissen
    .map((value) => sparqlEscapeString(value.mandatarisId))
    .join('\n');

  // TODO this breaks, we need to do it in two steps

  const constructQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?g ?s ?p ?o ?mandatarisId WHERE {
      VALUES ?mandatarisId {
        ${safeMandatarisIds}
      }
      {
        { ?s mu:uuid ?mandatarisId. }
        UNION
        { ?s ext:linked / mu:uuid ?mandatarisId. }
        UNION
        { ?other mu:uuid ?mandatarisId . ?other ext:linked ?s. }
      }
      GRAPH ?g {
        ?s a mandaat:Mandataris.
        ?s ?p ?o.
      }
      FILTER(?p NOT IN (mu:uuid, mandaat:rangorde, dct:modified, mandaat:start, org:hasMembership, lmb:hasPublicationStatus))
      ?g ext:ownedBy ?someone.
    }`;
  const mandatarisQuads = await querySudo(constructQuery);

  const transformedQuads = [];
  const idToIdMapping = {};
  mandatarisQuads.results.bindings.forEach((quad) => {
    let existingId = mandatarisMapping[quad.s.value];
    if (!existingId) {
      const newUuid = uuidv4();
      mandatarisMapping[quad.s.value] = newUuid;
      existingId = newUuid;
    }
    const newSubject = `http://data.lblod.info/id/mandatarissen/${existingId}`;
    idToIdMapping[quad.mandatarisId.value] = existingId;
    const transformedQuad = {
      ...quad,
      s: { value: newSubject },
    };
    transformedQuads.push(transformedQuad);
  });

  const quadsGroupedByGraph: QuadsGroupedByGraph = {};
  transformedQuads.forEach((quad) => {
    const graph = quad.g.value;
    if (!quadsGroupedByGraph[graph]) {
      quadsGroupedByGraph[graph] = [];
    }
    quadsGroupedByGraph[graph].push({
      s: quad.s,
      p: quad.p,
      o: quad.o,
    });
  });
  return { mandatarisMapping: idToIdMapping, quadsGroupedByGraph };
}

async function insertQuads(quadsGroupedByGraph: QuadsGroupedByGraph) {
  const insertGraphs = Object.keys(quadsGroupedByGraph)
    .map((graph) => {
      const quads = quadsGroupedByGraph[graph]
        .map((quad) => {
          return `${sparqlEscapeUri(quad.s.value)} ${sparqlEscapeUri(
            quad.p.value,
          )} ${sparqlEscapeQueryBinding(quad.o)} .`;
        })
        .join('\n');
      return `GRAPH ${sparqlEscapeUri(graph)} {
        ${quads}
      }`;
    })
    .join('\n');

  const insertQuery = `
    INSERT DATA {
      ${insertGraphs}
    }
  `;

  await updateSudo(insertQuery);
}

async function insertNewMandatarisData(
  mandatarissen: RangordeDiff[],
  date: Date,
  mandatarisIdMapping: Record<string, string>,
) {
  const safeMandatarissen = mandatarissen
    .map((value) => {
      const newId = mandatarisIdMapping[value.mandatarisId];
      const safeNewUuid = sparqlEscapeString(newId);
      const safeRangorde = sparqlEscapeString(value.rangorde);
      const safeUri = sparqlEscapeUri(
        `http://data.lblod.info/id/mandatarissen/${newId}`,
      );
      return `( ${safeUri} ${safeNewUuid} ${safeRangorde} )`;
    })
    .join('\n');

  const updateQuery = `
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
      PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

      INSERT {
        GRAPH ?g {
          ?mandataris mu:uuid ?newUuid .
          ?mandataris mandaat:rangorde ?rangorde .
          ?mandataris lmb:hasPublicationStatus <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/588ce330-4abb-4448-9776-a17d9305df07> .
          ?mandataris mandaat:start ${sparqlEscapeDateTime(date)} .
        }
      } WHERE {
        VALUES (?mandataris ?newUuid ?rangorde) {
          ${safeMandatarissen}
        }
        GRAPH ?g {
          ?mandataris a mandaat:Mandataris .
        }
        ?g ext:ownedBy ?someone.
      }
    `;
  await updateSudo(updateQuery);
}

async function addMemberships(mandatarisUuidMapping: Record<string, string>) {
  const safeMandatarisIds = Object.keys(mandatarisUuidMapping)
    .map((originalId) => {
      return `( ${sparqlEscapeString(originalId)} ${sparqlEscapeString(
        mandatarisUuidMapping[originalId],
      )} )`;
    })
    .join('\n');
  const updateQuery = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT {
      GRAPH ?g {
        ?newMembership ?p ?o.
        ?newMandataris org:hasMembership ?newMembership.
        ?newMembership dct:modified ?now.
        ?newMembership mu:uuid ?newMembershipId.
      }
    }
    WHERE {
      VALUES ( ?originalMandatarisId ?newMandatarisId ) {
        ${safeMandatarisIds}
      }
      GRAPH ?g {
        ?originalMandataris org:hasMembership ?membership.
        ?originalMandataris mu:uuid ?originalMandatarisId.
        ?membership ?p ?o.
        FILTER(?p NOT IN (dct:modified, mu:uuid ))
        BIND(STRUUID() AS ?newMembershipId)
        BIND(IRI(CONCAT("http://data.lblod.info/id/mandatarissen/", ?newMandatarisId)) AS ?newMandataris)
        BIND(IRI(CONCAT("http://data.lblod.info/id/lidmaatschappen/", ?newMembershipId)) AS ?newMembership)
        BIND(NOW() AS ?now)
      }
      ?g ext:ownedBy ?someone.
    }
  `;
  await updateSudo(updateQuery);
}

async function endAffectedMandatarissen(mandatarisIds: string[], date: Date) {
  const safeMandatarisIds = mandatarisIds
    .map((value) => sparqlEscapeString(value))
    .join('\n');
  const updateQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE {
      GRAPH ?g {
        ?mandataris mandaat:einde ?oldEinde .
        ?mandataris dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ?g {
        ?mandataris mandaat:einde ${sparqlEscapeDateTime(date)} .
        ?mandataris dct:modified ${sparqlEscapeDateTime(new Date())} .
      }
    }
    WHERE {
      VALUES ?mandatarisId {
        ${safeMandatarisIds}
      }
      GRAPH ?g {
        ?mandataris a mandaat:Mandataris .
        ?mandataris mu:uuid ?mandatarisId.

        OPTIONAL {
          ?mandataris mandaat:einde ?oldEinde .
        }
        OPTIONAL {
          ?mandataris dct:modified ?oldModified .
        }
      }
      ?g ext:ownedBy ?someone.
    }`;
  await updateSudo(updateQuery);
}

async function getMandatarissenWithoutRangorde(mandatarissen: RangordeDiff[]) {
  const safeMandatarisIds = mandatarissen
    .map((value) => sparqlEscapeString(value.mandatarisId))
    .join('\n');
  const selectQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    SELECT ?mandatarisId WHERE {
      VALUES ?mandatarisId {
        ${safeMandatarisIds}
      }
      ?mandataris a mandaat:Mandataris ;
        mu:uuid ?mandatarisId ;
        mandaat:rangorde ?rangorde .

    }
  `;
  const result = await query(selectQuery);
  const idsWithRangorde = new Set(
    result.results.bindings.map((res) => res.mandatarisId.value),
  );
  const withRangorde: RangordeDiff[] = [];
  const withoutRangorde: RangordeDiff[] = [];
  mandatarissen.forEach((value) => {
    if (idsWithRangorde.has(value.mandatarisId)) {
      withRangorde.push(value);
    } else {
      withoutRangorde.push(value);
    }
  });
  return { withoutRangorde, withRangorde };
}

async function correctRangorde(mandatarissen: RangordeDiff[]) {
  if (!mandatarissen || mandatarissen.length == 0) {
    throw new HttpError('No mandatarissen provided', STATUS_CODE.BAD_REQUEST);
  }

  // We just check access to the first mandataris
  const isMandataris = await isValidId(
    RDF_TYPE.MANDATARIS,
    mandatarissen.at(0).mandatarisId,
  );
  if (!isMandataris) {
    throw new HttpError('Unauthorized', 401);
  }

  // Probably need to check if all mandatarissen exist?

  // This is a correct mistakes version, still need a update state version
  await updateRangordesQuery(mandatarissen);
  return;
}

export async function updateRangordesQuery(
  mandatarissen: RangordeDiff[],
): Promise<void> {
  const valueBindings = mandatarissen
    .map((value) => {
      return `(${sparqlEscapeString(value.mandatarisId)} ${sparqlEscapeString(
        value.rangorde,
      )})`;
    })
    .join('\n');
  console.log(valueBindings);

  const query = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE {
      GRAPH ?graph {
        ?mandataris mandaat:rangorde ?rangorde .
        ?mandataris dct:modified ?modified .
      }
    }
    INSERT {
      GRAPH ?graph {
        ?mandataris mandaat:rangorde ?newRangorde .
        ?mandataris dct:modified ?now .
      }
    }
    WHERE {
      GRAPH ?graph {
        ?mandataris a mandaat:Mandataris ;
          mu:uuid ?mandatarisId .
        OPTIONAL {
          ?mandataris mandaat:rangorde ?rangorde .
        }
        OPTIONAL {
          ?mandataris dct:modified ?modified .
        }
      }
      VALUES (?mandatarisId ?newRangorde) {
        ${valueBindings}
      }
      BIND(NOW() AS ?now)
      ?graph ext:ownedBy ?owner.
    }
  `;

  await update(query);
}

async function addNewMandatarisLinks(
  mandatarisMapping: Record<string, string>,
) {
  const safeMandatarisIds = Object.keys(mandatarisMapping)
    .map((value) => {
      return sparqlEscapeString(value);
    })
    .join('\n');
  // only one direction needed because the mapping contains both from and to
  const fetchOldLinksQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?oldFrom ?oldTo WHERE {
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        ?oldMandatarisFrom ext:linked ?oldMandatarisTo.
      }
      ?oldMandatarisFrom mu:uuid ?oldFrom.
      ?oldMandatarisTo mu:uuid ?oldTo.
      VALUES ?oldFrom {
          ${safeMandatarisIds}
      }
    }
    `;

  const result = await querySudo(fetchOldLinksQuery);
  const safeNewLinks = result.results.bindings
    .map((binding) => {
      const oldFrom = binding.oldFrom.value;
      const oldTo = binding.oldTo.value;
      const newFrom = mandatarisMapping[oldFrom];
      const newTo = mandatarisMapping[oldTo];
      if (!newFrom || !newTo) {
        return null; // sometimes a link can linger after the mandataris was deleted
      }
      return `( ${sparqlEscapeUri(newFrom)} ${sparqlEscapeUri(newTo)} )`;
    })
    .filter((value) => value !== null);

  const insertNewLinksQuery = `
    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        ${safeNewLinks.join('\n')}
      }
    }
  `;
  await updateSudo(insertNewLinksQuery);
}

export { rangordeRouter };
