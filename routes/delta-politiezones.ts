import { Request, Response } from 'express';
import { sparqlEscapeUri } from 'mu';

import { Changeset, Quad } from '../types';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';

const REPAIR_BATCH_SIZE = 1000;

/**
 * The idea here is that a police-zone is shared between multiple local governments. The concepts in the zone can be seen by all local governments in the zone but concepts created by a local government can only be edited by that local government.
 *
 * To make this a reality, we need to react to incoming deltas of such concepts and make sure they are mirrored 1-to-1 to the police zone graph. We can just replace the entire concept in the police zone graph by the concept in the local government graph.
 *
 * There is a risk that we miss deltas during the lifetime of the system, e.g. when our service is killed but other services still produce/modify data.
 *
 * Therefore, we need to detect and move unmirrored changes at startup. We use the modified date of the concepts to detect these changes.
 *
 * As we expect no fractions for police zone mandatarissen, meaning that the only relevant changes are to the mandataris or person (or geboorte or identifier) itself
 */

export async function handleDeltaPolitiezone(req: Request, res: Response) {
  const changesets: Changeset[] = req.body;
  const touchedTriples = changesets
    .map((changeset) => {
      return [...(changeset.inserts || []), ...(changeset.deletes || [])];
    })
    .flat();

  const mandatarisOrPersonSubjects = Array.from(
    new Set(touchedTriples.map((quad: Quad) => quad.subject.value)),
  ).filter((s) => {
    return s.startsWith('http://data.lblod.info/id/mandatarissen/');
  });

  await mirrorInstances(mandatarisOrPersonSubjects);

  res.status(200).send({ status: 'ok' });
}

export async function repairPolitiezoneData() {
  let missingInstancesLeft = true;
  while (missingInstancesLeft) {
    const missingInstances = await findBatchOfMissedInstances();
    if (missingInstances.length === 0) {
      missingInstancesLeft = false;
    } else {
      await mirrorInstances(missingInstances);
    }
  }
}

const safePathsToSubjectToMirror = `
  { { ?s org:holds ?mandate. }
    UNION
    { ?s ^mandaat:isBestuurlijkeAliasVan / org:holds ?mandate .}
    UNION
    { ?s ^adms:identifier / ^mandaat:isBestuurlijkeAliasVan / org:holds ?mandate .}
    UNION
    { ?s ^persoon:heeftGeboorte / ^mandaat:isBestuurlijkeAliasVan / org:holds ?mandate . } }
`;

async function findBatchOfMissedInstances() {
  // This makes the assumption that there is only one modified date per instance in the local government graph
  const findMissedInstancesQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX org: <http://www.w3.org/ns/org#>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX persoon: <http://www.w3.org/ns/person#>
    PREFIX adms: <http://www.w3.org/ns/adms#>

    SELECT DISTINCT ?s WHERE {
      GRAPH ?g {
        ?s a ?type .
        ?s dct:modified ?currentModified.
      }
      GRAPH ?policeZoneGraph {
       ?orgT org:hasPost ?mandate.
        ?orgT mandaat:isTijdspecialisatieVan ?org.
        # politieraad
        ?org besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuursorgaanClassificatieCode/1afce932-53c1-46d8-8aab-90dcc331e67d> .
      }
      OPTIONAL {
        GRAPH ?policeZoneGraph {
          ?s dct:modified ?oldModified.
        }
      }
      FILTER(!BOUND(?oldModified) || ?currentModified != ?oldModified)
      ?g ext:ownedBy ?localGovernment.
      ?policeZoneGraph ext:ownedBy ?policeZone.
      ?localGovernment ext:deeltBestuurVan ?policeZone.
      # police zone classificatie
      ?policeZone besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/a3922c6d-425b-474f-9a02-ffb71a436bfc> .

      ${safePathsToSubjectToMirror}
    } LIMIT ${REPAIR_BATCH_SIZE}
  `;
  const result = await querySudo(findMissedInstancesQuery);
  return result.results.bindings.map((binding) => binding.s.value);
}

async function mirrorInstances(instanceUri: string[]) {
  if (instanceUri.length === 0) {
    return;
  }
  const safeInstanceUris = instanceUri
    .map((uri) => sparqlEscapeUri(uri))
    .join('\n');

  // first select instances that are of interest to police zones
  const selectQuery = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX dct: <http://purl.org/dc/terms>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX persoon: <http://www.w3.org/ns/person#>
  PREFIX adms: <http://www.w3.org/ns/adms#>

  SELECT DISTINCT ?target WHERE {
    VALUES ?s {
      ${safeInstanceUris}
    }
    GRAPH ?g {
      ?s a ?thing.
      ${safePathsToSubjectToMirror}

      {{ ?s a ?thing.
         BIND(?s as ?target)
        } UNION {
         ?s mandaat:isBestuurlijkeAliasVan ?target .
        } UNION {
         ?s mandaat:isBestuurlijkeAliasVan / ( persoon:heeftGeboorte | adms:identifier ) ?target .
      }}
    }
    GRAPH ?policeZoneGraph {
      ?orgT org:hasPost ?mandate.
      ?orgT mandaat:isTijdspecialisatieVan ?org.
      # politieraad
      ?org besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuursorgaanClassificatieCode/1afce932-53c1-46d8-8aab-90dcc331e67d> .
    }
    ?g ext:ownedBy ?localGovernment.
    ?policeZoneGraph ext:ownedBy ?policeZone.
    ?localGovernment ext:deeltBestuurVan ?policeZone.
    # police zone classificatie
    ?policeZone besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/a3922c6d-425b-474f-9a02-ffb71a436bfc> .
  }`;

  const relevantInstances = await querySudo(selectQuery);
  const relevantInstanceUris = relevantInstances.results.bindings.map((r) => {
    return sparqlEscapeUri(r.target.value);
  });
  const uniqueInstanceUris = Array.from(new Set(relevantInstanceUris)).join(
    '\n',
  );

  // split into delete and insert for efficiency, else we have an optional s p o in the delete part
  // this allows for the possibility of a temporary inconsistency (millisecond scale) in the police zone graph
  // but eventually the graph will be consistent, so this is acceptable
  const deleteQuery = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX dct: <http://purl.org/dc/terms>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX persoon: <http://www.w3.org/ns/person#>
  PREFIX adms: <http://www.w3.org/ns/adms#>

  DELETE {
    GRAPH ?policeZoneGraph {
      ?s ?p ?o .
    }
  }
  WHERE {
    VALUES ?s {
      ${uniqueInstanceUris}
    }
    GRAPH ?g {
      ?s a ?thing.
    }
    GRAPH ?policeZoneGraph {
      ?orgT org:hasPost ?mandate.
      ?orgT mandaat:isTijdspecialisatieVan ?org.
      # politieraad
      ?org besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuursorgaanClassificatieCode/1afce932-53c1-46d8-8aab-90dcc331e67d> .
      ?s ?p ?o.
    }
    ?g ext:ownedBy ?localGovernment.
    ?policeZoneGraph ext:ownedBy ?policeZone.
    ?localGovernment ext:deeltBestuurVan ?policeZone.
    # police zone classificatie
    ?policeZone besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/a3922c6d-425b-474f-9a02-ffb71a436bfc> .
  }
  `;

  await updateSudo(deleteQuery);

  const insertQuery = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX dct: <http://purl.org/dc/terms>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX persoon: <http://www.w3.org/ns/person#>
  PREFIX adms: <http://www.w3.org/ns/adms#>

  INSERT {
    GRAPH ?policeZoneGraph {
      ?s ?pNew ?oNew .
    }
  }
  WHERE {
    VALUES ?s {
      ${uniqueInstanceUris}
    }
    GRAPH ?g {
      ?s a ?thing.
      ?s ?pNew ?oNew.
    }
    GRAPH ?policeZoneGraph {
      ?orgT org:hasPost ?mandate.
      ?orgT mandaat:isTijdspecialisatieVan ?org.
      # politieraad
      ?org besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuursorgaanClassificatieCode/1afce932-53c1-46d8-8aab-90dcc331e67d> .
    }
    ?g ext:ownedBy ?localGovernment.
    ?policeZoneGraph ext:ownedBy ?policeZone.
    ?localGovernment ext:deeltBestuurVan ?policeZone.
    # police zone classificatie
    ?policeZone besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/a3922c6d-425b-474f-9a02-ffb71a436bfc> .
  }
  `;

  await updateSudo(insertQuery);
}

repairPolitiezoneData()
  .catch((e) => {
    console.log(`Failed to repair police zone data: ${e.message}`);
  })
  .then(() => {
    console.log('Finished repairing police zone data');
  });
