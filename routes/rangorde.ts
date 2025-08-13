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

import { PUBLICATION_STATUS, STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';
import { sparqlEscapeQueryBinding } from '../util/sparql-escape';

const rangordeRouter = Router();

type RangordeDiff = {
  mandatarisId: string;
  rangorde: string;
};
type RangordeDiffByUri = {
  mandatarisUri: string;
  rangorde: string;
};

rangordeRouter.post(
  '/update-rangordes/',
  async (req: Request, res: Response) => {
    const { mandatarissen, date } = req.body;
    const mandatarissenByUri = await transformIdsToUris(mandatarissen);

    try {
      if (req.query.asCorrection === 'true') {
        await correctRangorde(mandatarissenByUri);
      } else {
        await updateRangorde(mandatarissenByUri, date);
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

async function transformIdsToUris(mandatarissen: RangordeDiff[]) {
  const safeMandatarisIds = mandatarissen
    .map((value) => sparqlEscapeString(value.mandatarisId))
    .join('\n');
  const selectQuery = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    SELECT ?mandatarisId ?mandataris WHERE {
      VALUES ?mandatarisId {
        ${safeMandatarisIds}
      }
      ?mandataris mu:uuid ?mandatarisId.
    }`;
  const result = await query(selectQuery);
  const idToUriMapping = {};
  result.results.bindings.forEach((binding) => {
    idToUriMapping[binding.mandatarisId.value] = binding.mandataris.value;
  });
  return mandatarissen.map((value) => {
    return {
      rangorde: value.rangorde,
      mandatarisUri: idToUriMapping[value.mandatarisId],
    };
  });
}

async function updateRangorde(mandatarissen: RangordeDiffByUri[], date: Date) {
  if (!date) {
    throw new HttpError('No date provided', STATUS_CODE.BAD_REQUEST);
  }
  const { withoutRangorde, withRangorde } =
    await splitMandatarissenAlongRangorde(mandatarissen);

  if (withoutRangorde.length > 0) {
    await correctRangorde(withoutRangorde);
  }
  if (withRangorde.length > 0) {
    await endAndCreateMandatarissenForNewRangordes(withRangorde, date);
  }
}

async function endAndCreateMandatarissenForNewRangordes(
  mandatarissen: RangordeDiffByUri[],
  date: Date,
) {
  const mandatarissenWithLinkedMandatarissen = await createNewMandatarissen(
    mandatarissen,
    date,
  );
  await endAffectedMandatarissen(
    mandatarissenWithLinkedMandatarissen.map((value) => value.mandatarisUri),
    date,
  );
}

async function createNewMandatarissen(
  mandatarissen: RangordeDiffByUri[],
  date: Date,
) {
  const mandatarissenAndLinkedMandatarissen =
    await combineWithLinkedMandatarissen(mandatarissen);
  const { quadsGroupedByGraph, mandatarisToNewUuidMapping } =
    await buildNewMandatarisQuads(mandatarissenAndLinkedMandatarissen);
  await insertQuads(quadsGroupedByGraph);
  await insertNewMandatarisData(
    mandatarissenAndLinkedMandatarissen,
    date,
    mandatarisToNewUuidMapping,
  );
  await addNewMandatarisLinks(mandatarisToNewUuidMapping);
  await addMemberships(mandatarisToNewUuidMapping);
  return mandatarissenAndLinkedMandatarissen;
}

type QuadsGroupedByGraph = Record<
  string,
  {
    s: { value: string };
    p: { value: string };
    o: { value: string; type: string; datatype: string };
  }[]
>;

async function combineWithLinkedMandatarissen(
  mandatarissen: RangordeDiffByUri[],
) {
  const safeMandatarissen = mandatarissen
    .map((value) => sparqlEscapeUri(value.mandatarisUri))
    .join('\n');
  const selectQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?linked WHERE {
      VALUES ?mandataris {
        ${safeMandatarissen}
      }
      {
        { ?linked ext:linked ?mandataris. }
        UNION
        { ?mandataris ext:linked ?linked. }
      }
      GRAPH ?g {
        ?linked a mandaat:Mandataris.
      }
      ?g ext:ownedBy ?someone.
    }
  `;
  const result = await querySudo(selectQuery);
  const combinedMandatarissen = [...mandatarissen];
  result.results.bindings.forEach((binding) => {
    combinedMandatarissen.push({
      mandatarisUri: binding.linked.value,
      // the linked mandatarissen are part of the ocmw and don't have a rangorde
      rangorde: null,
    });
  });
  return combinedMandatarissen;
}

async function buildNewMandatarisQuads(mandatarissen: RangordeDiffByUri[]) {
  const mandatarisToNewUuidMapping: Record<string, string> = {};
  const safeMandatarissen = mandatarissen
    .map((value) => sparqlEscapeUri(value.mandatarisUri))
    .join('\n');

  const constructQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

    SELECT DISTINCT ?g ?s ?p ?o WHERE {
      VALUES ?s {
        ${safeMandatarissen}
      }
      GRAPH ?g {
        ?s a mandaat:Mandataris.
        ?s ?p ?o.
      }
      FILTER(?p NOT IN (mu:uuid, mandaat:rangorde, dct:modified, mandaat:start, org:hasMembership, lmb:hasPublicationStatus, lmb:linkToBesluit))
      ?g ext:ownedBy ?someone.
    }`;
  const mandatarisQuads = await querySudo(constructQuery);

  const transformedQuads = [];
  mandatarisQuads.results.bindings.forEach((quad) => {
    let newUuid = mandatarisToNewUuidMapping[quad.s.value];
    if (!newUuid) {
      newUuid = uuidv4();
      mandatarisToNewUuidMapping[quad.s.value] = newUuid;
    }
    const newSubject = buildNewMandatarisUri(newUuid);
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
  return { mandatarisToNewUuidMapping, quadsGroupedByGraph };
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
  mandatarissen: RangordeDiffByUri[],
  date: Date,
  mandatarisToNewUuidMapping: Record<string, string>,
) {
  const safeMandatarissen = mandatarissen
    .map((value) => {
      const newId = mandatarisToNewUuidMapping[value.mandatarisUri];
      const safeNewUuid = sparqlEscapeString(newId);
      const safeRangorde = value.rangorde
        ? sparqlEscapeString(value.rangorde)
        : 'undef'; // undef in case of ocmw mandataris who don't have rangorde
      const safeUri = sparqlEscapeUri(buildNewMandatarisUri(newId));
      return `( ${safeUri} ${safeNewUuid} ${safeRangorde} )`;
    })
    .join('\n');
  const nietBekrachtigd = sparqlEscapeUri(PUBLICATION_STATUS.NIET_BEKRACHTIGD);
  const updateQuery = `
      PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
      PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>

      INSERT {
        GRAPH ?g {
          ?mandataris mu:uuid ?newUuid .
          ?mandataris mandaat:rangorde ?rangorde .
          ?mandataris lmb:hasPublicationStatus ${nietBekrachtigd} .
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

async function addMemberships(
  mandatarisToNewIdMapping: Record<string, string>,
) {
  const safeMandatarisUris = Object.keys(mandatarisToNewIdMapping)
    .map((originalMandataris) => {
      const newMandataris = buildNewMandatarisUri(
        mandatarisToNewIdMapping[originalMandataris],
      );
      const safeMandataris = sparqlEscapeUri(originalMandataris);
      const safeNewMandataris = sparqlEscapeUri(newMandataris);
      return `( ${safeMandataris} ${safeNewMandataris} )`;
    })
    .join('\n');
  // need to work in two steps because a single insert will create a new uuid for every row in the result (for every p)
  const selectNewUUidsQuery = `
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?originalMembership ?newMembershipUuid ?newMandataris
    WHERE {
      VALUES ( ?originalMandataris ?newMandataris ) {
        ${safeMandatarisUris}
      }
      GRAPH ?g {
        ?originalMandataris org:hasMembership ?originalMembership.
        ?originalMembership a org:Membership.
        BIND(STRUUID() AS ?newMembershipUuid)
      }
      ?g ext:ownedBy ?someone.
    }
  `;
  const result = await querySudo(selectNewUUidsQuery);
  const safeNewMembershipLinks = result.results.bindings
    .map((binding) => {
      const id = binding.newMembershipUuid.value;
      return `( ${sparqlEscapeUri(
        binding.originalMembership.value,
      )} ${sparqlEscapeUri(
        `http://data.lblod.info/id/lidmaatschappen/${id}`,
      )} ${sparqlEscapeString(id)} ${sparqlEscapeUri(
        binding.newMandataris.value,
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
        ?newMembership mu:uuid ?newMembershipUuid.
      }
    }
    WHERE {
      VALUES ( ?originalMembership ?newMembership ?newMembershipUuid ?newMandataris ) {
        ${safeNewMembershipLinks}
      }
      GRAPH ?g {
        ?originalMembership a org:Membership.
        ?originalMembership ?p ?o.
        FILTER(?p NOT IN (dct:modified, mu:uuid ))
        BIND(NOW() AS ?now)
      }
      ?g ext:ownedBy ?someone.
    }
  `;
  await updateSudo(updateQuery);
}

async function endAffectedMandatarissen(mandatarisUris: string[], date: Date) {
  const safeMandatarissen = mandatarisUris
    .map((value) => sparqlEscapeUri(value))
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
      VALUES ?mandataris {
        ${safeMandatarissen}
      }
      GRAPH ?g {
        ?mandataris a mandaat:Mandataris .

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

async function splitMandatarissenAlongRangorde(
  mandatarissen: RangordeDiffByUri[],
) {
  const safeMandatarisUris = mandatarissen
    .map((value) => sparqlEscapeUri(value.mandatarisUri))
    .join('\n');
  const selectQuery = `
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    SELECT ?mandataris WHERE {
      VALUES ?mandataris {
        ${safeMandatarisUris}
      }
      ?mandataris a mandaat:Mandataris ;
        mandaat:rangorde ?rangorde .
    }
  `;
  const result = await query(selectQuery);
  const mandatarissenWithRangorde = new Set(
    result.results.bindings.map((res) => res.mandataris.value),
  );
  const withRangorde: RangordeDiffByUri[] = [];
  const withoutRangorde: RangordeDiffByUri[] = [];
  mandatarissen.forEach((value) => {
    if (mandatarissenWithRangorde.has(value.mandatarisUri)) {
      withRangorde.push(value);
    } else {
      withoutRangorde.push(value);
    }
  });
  return { withoutRangorde, withRangorde };
}

async function correctRangorde(mandatarissen: RangordeDiffByUri[]) {
  if (!mandatarissen || mandatarissen.length == 0) {
    throw new HttpError('No mandatarissen provided', STATUS_CODE.BAD_REQUEST);
  }

  // no need to check if the uris exist, we will do a regular update so seas will handle it
  await updateRangordesQuery(mandatarissen);
  return;
}

export async function updateRangordesQuery(
  mandatarissen: RangordeDiffByUri[],
): Promise<void> {
  const valueBindings = mandatarissen
    .map((value) => {
      return `(${sparqlEscapeUri(value.mandatarisUri)} ${sparqlEscapeString(
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
      ?mandataris mandaat:rangorde ?rangorde .
      ?mandataris dct:modified ?modified .
    }
    INSERT {
      ?mandataris mandaat:rangorde ?newRangorde .
      ?mandataris dct:modified ?now .
    }
    WHERE {
      ?mandataris a mandaat:Mandataris .

      OPTIONAL {
        ?mandataris mandaat:rangorde ?rangorde .
      }
      OPTIONAL {
        ?mandataris dct:modified ?modified .
      }
      VALUES (?mandataris ?newRangorde) {
        ${valueBindings}
      }
      BIND(NOW() AS ?now)
    }
  `;

  await update(query);
}

async function addNewMandatarisLinks(
  mandatarisMapping: Record<string, string>,
) {
  const safeMandatarissen = Object.keys(mandatarisMapping)
    .map((value) => {
      return sparqlEscapeUri(value);
    })
    .join('\n');
  // only one direction needed because the mapping contains both from and to
  const fetchOldLinksQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    SELECT DISTINCT ?oldMandatarisFrom ?oldMandatarisTo WHERE {
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        ?oldMandatarisFrom ext:linked ?oldMandatarisTo.
      }
      ?oldMandatarisFrom a mandaat:Mandataris.
      VALUES ?oldMandatarisFrom {
          ${safeMandatarissen}
      }
    }
    `;

  const result = await querySudo(fetchOldLinksQuery);
  const safeNewLinks = result.results.bindings
    .map((binding) => {
      const oldMandatarisFrom = binding.oldMandatarisFrom.value;
      const oldMandatarisTo = binding.oldMandatarisTo.value;
      const newFromId = mandatarisMapping[oldMandatarisFrom];
      const newToId = mandatarisMapping[oldMandatarisTo];
      const safeFrom = sparqlEscapeUri(buildNewMandatarisUri(newFromId));
      const safeTo = sparqlEscapeUri(buildNewMandatarisUri(newToId));
      if (!newFromId || !newToId) {
        return null; // sometimes a link can linger after the mandataris was deleted
      }
      return `${safeFrom} ext:linked ${safeTo} .`;
    })
    .filter((value) => value !== null)
    .join('\n');

  const insertNewLinksQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/linkedInstances> {
        ${safeNewLinks}
      }
    }`;
  await updateSudo(insertNewLinksQuery);
}

function buildNewMandatarisUri(id: string) {
  return `http://data.lblod.info/id/mandatarissen/${id}`;
}

export { rangordeRouter };
