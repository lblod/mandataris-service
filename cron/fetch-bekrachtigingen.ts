import { CronJob } from 'cron';
import { updateSudo as update, querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { getIdentifierFromUri } from '../util/uuid-for-uri';
import { v4 as uuidv4 } from 'uuid';

const HARVEST_CRON_PATTERN = process.env.HARVEST_CRON_PATTERN || '0 * * * *'; // Every hour

const receiverGraph = 'http://mu.semte.ch/graphs/besluit-bekrachtigingen';
const bekrachtigingGraph = 'http://mu.semte.ch/graphs/besluiten-consumed';

async function processBekrachtigingen() {
  const harvesters = [
    'https://lokaalbeslist-harvester-0.s.redhost.be',
    'https://lokaalbeslist-harvester-1.s.redhost.be',
    'https://lokaalbeslist-harvester-2.s.redhost.be',
    'https://lokaalbeslist-harvester-3.s.redhost.be',
  ];

  for (const harvester of harvesters) {
    await processBekrachtigingenForHarvester(harvester).catch((e) => {
      console.log(
        `Error processing bekrachtigingen for harvester ${harvester}: ${e.message}`,
      );
    });
  }
  await addMissingUuidsAndTypes();
}

async function processBekrachtigingenForHarvester(harvester: string) {
  await fetchBekrachtigingenForHarvester(harvester);
  await processCurrentBekrachtigingen();
}

async function fetchBekrachtigingenForHarvester(harvester: string) {
  const path = '/assets/exports/export-bekrachtigingen.ttl';
  const ttldata = await fetch(`${harvester}${path}`).then((res) => {
    if (res.status >= 400) {
      throw new Error(
        'Error fetching bekrachtigingen, status code: ' + res.status,
      );
    }
    return res.text();
  });

  await update(`DELETE {
    GRAPH ${sparqlEscapeUri(receiverGraph)} {
      ?s ?p ?o.
    }
  } WHERE {
    GRAPH ${sparqlEscapeUri(receiverGraph)} {
      ?s ?p ?o.
    }
  }`);

  const batchedTtlData = ttldata.split('> .\n');
  while (batchedTtlData.length > 0) {
    const batch = batchedTtlData.splice(0, 1000).join('> .\n');
    const suffix = batchedTtlData.length > 0 ? '> .\n' : '';
    await update(`
    INSERT DATA {
       GRAPH ${sparqlEscapeUri(receiverGraph)} {
          ${batch}${suffix}
       }
    }`);
  }
}

async function processCurrentBekrachtigingen() {
  // weirdly doing this in one query is too heavy for virtuoso when filtering on startdate
  // splitting in two
  await update(`
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  INSERT {
    GRAPH ${sparqlEscapeUri(receiverGraph)} {
      ?besluit ext:targets ?mandataris.
    }
  } WHERE {
    GRAPH ${sparqlEscapeUri(receiverGraph)} {
      ?besluit ext:forRole ?role.
      ?besluit ext:bekrachtigtMandatarissenVoor ?orgInT.
    }
    GRAPH ?g {
      ?mandataris a mandaat:Mandataris.
      ?mandataris org:holds / org:role ?role.
      ?mandataris org:holds / ^org:hasPost ?trueOrgInT.
      ?orgInT lmb:heeftBestuursperiode ?periode.
      ?trueOrgInT lmb:heeftBestuursperiode ?periode.
      ?orgInT mandaat:isTijdspecialisatieVan / besluit:bestuurt / ^besluit:bestuurt / ^mandaat:isTijdspecialisatieVan ?trueOrgInT.
    }
    ?g ext:ownedBy ?someone.
  }
  `);

  await update(`
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  DELETE {
    GRAPH ?g {
      ?mandataris lmb:hasPublicationStatus ?status.
      ?mandataris dct:modified ?modified.
    }
  }
  INSERT {
    GRAPH ${sparqlEscapeUri(bekrachtigingGraph)} {
      ?besluit mandaat:bekrachtigtAanstellingVan ?mandataris.
      ?besluit ext:autoHarvested ?true.
    }
    GRAPH ?g {
      ?mandataris lmb:hasPublicationStatus <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/9d8fd14d-95d0-4f5e-b3a5-a56a126227b6>.
      ?mandataris dct:modified ?now.
    }
  } WHERE {
    GRAPH ${sparqlEscapeUri(receiverGraph)} {
      ?besluit ext:targets ?mandataris.
    }
    GRAPH ?g {
      ?mandataris a mandaat:Mandataris.
      FILTER NOT EXISTS {
        ?mandataris lmb:hasPublicationStatus <http://data.lblod.info/id/concept/MandatarisPublicationStatusCode/9d8fd14d-95d0-4f5e-b3a5-a56a126227b6> .
      }
      ?mandataris mandaat:start ?start.
      FILTER (?start < "2024-12-31T23:59:59.999"^^xsd:dateTime)
      OPTIONAL {
        ?mandataris dct:modified ?modified.
      }
      OPTIONAL {
        ?mandataris lmb:hasPublicationStatus ?status.
      }
    }
    ?g ext:ownedBy ?someone.
    BIND(NOW() as ?now)
  }
  `);
}

async function addMissingUuidsAndTypes() {
  const query = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  SELECT ?besluit WHERE {
    GRAPH ${sparqlEscapeUri(bekrachtigingGraph)} {
      ?besluit mandaat:bekrachtigtAanstellingVan ?mandataris.
    }
    FILTER NOT EXISTS {
      ?besluit mu:uuid ?id.
    }
  }`;
  const results = await querySudo(query);
  const newUuids = results.results.bindings.map((binding) => {
    const uri = binding.besluit.value;
    let id = getIdentifierFromUri(uri);
    if (!id) {
      id = uuidv4();
    }
    return { uri, id };
  });

  const triplesToInsert = newUuids
    .map(
      ({ uri, id }) =>
        `${sparqlEscapeUri(uri)} mu:uuid ${sparqlEscapeString(id)} .`,
    )
    .join('\n');
  const updateUuids = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(bekrachtigingGraph)} {
        ${triplesToInsert}
      }
    }
  `;
  await update(updateUuids);
  await update(`
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  INSERT {
    GRAPH ${sparqlEscapeUri(bekrachtigingGraph)} {
      ?besluit a besluit:Besluit.
    }
  } WHERE {
    GRAPH ${sparqlEscapeUri(bekrachtigingGraph)} {
      ?besluit mandaat:bekrachtigtAanstellingVan ?mandataris.
    }
  }`);
}

let running = false;
export const cronjob = CronJob.from({
  cronTime: HARVEST_CRON_PATTERN,
  onTick: async () => {
    console.log(
      'DEBUG: Starting cronjob to send notifications for effective mandatees without besluit.',
    );
    if (running) {
      return;
    }
    running = true;
    await processBekrachtigingen();
    running = false;
  },
});
