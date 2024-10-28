import { Request, Response } from 'express';
import Router from 'express-promise-router';
import { sparqlEscapeString } from '../util/mu';
import { query } from 'mu';
import { json2csv } from 'json-2-csv';

export const electionResultsRouter = Router();

electionResultsRouter.get(
  '/:id/download',
  async (req: Request, res: Response) => {
    const electionResultsId = req.params.id;

    if (!canSeeElection(electionResultsId)) {
      return res.status(404).send('Verkiezing niet gevonden');
    }

    const result = await downloadElectionResults(electionResultsId);
    res.set('Content-Type', 'text/csv');
    res.set(
      'Content-Disposition',
      'attachment; filename="verkiezingsresultaten.csv"',
    );
    return res.status(200).send(result);
  },
);

async function canSeeElection(id: string) {
  const sparql = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX lmb: <http://lblod.data.gift/vocabularies/lmb/>
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

  SELECT * WHERE {
    ?s a mandaat:RechtstreekseVerkiezing .
    ?s mu:uuid ${sparqlEscapeString(id)} .
  } LIMIT 1`;
  const result = await query(sparql);
  return result.results.bindings.length > 0;
}

async function downloadElectionResults(
  electionResultsId: string,
): Promise<string> {
  const q = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT ?PersoonURI ?RRN ?Voornaam ?Achternaam ?GeboorteDatum ?LijstURI ?Lijstnaam ?Lijstnummer ?AantalNaamStemmen ?PlaatsRangorde
    WHERE {
      ?verkiezing mu:uuid ${sparqlEscapeString(electionResultsId)} .
      ?LijstURI mandaat:behoortTot ?verkiezing.
      ?LijstURI mandaat:lijstnr ?Lijstnummer .
      ?LijstURI skos:prefLabel ?Lijstnaam .

      ?result mandaat:isResultaatVoor ?LijstURI .
      ?result mandaat:isResultaatVan ?PersoonURI .
      ?result mandaat:aantalNaamstemmen ?AantalNaamStemmen .
      OPTIONAL {
        ?result mandaat:plaatsRangorde ?PlaatsRangorde .
      }

      ?PersoonURI a <http://www.w3.org/ns/person#Person> .
      OPTIONAL {
        ?PersoonURI adms:identifier / skos:notation ?RRN .
      }
      OPTIONAL {
        ?PersoonURI persoon:gebruikteVoornaam ?Voornaam .
      }
      OPTIONAL {
        ?PersoonURI foaf:familyName ?Achternaam .
      }
      OPTIONAL {
        ?PersoonURI persoon:heeftGeboorte / persoon:datum ?GeboorteDatum .
      }
    }
  `;
  const result = await query(q);
  const results = result.results.bindings.map((b) => {
    const simplified = {};
    for (const key in b) {
      simplified[key] = b[key].value;
    }
    return simplified;
  });
  const csv = await json2csv(results);
  return csv;
}
