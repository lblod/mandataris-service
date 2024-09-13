import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { sparqlEscapeDateTime } from 'mu';
import { updateSudo } from '@lblod/mu-auth-sudo';
import { v4 as uuidv4 } from 'uuid';

export const mockRouter = Router();

mockRouter.get('/add-decision', async (req: Request, res: Response) => {
  console.log('\n \t|>Triggered the add decision endpoint');

  let action = createDecisionForKnownMandatarisAndPerson;

  if (req.query.new) {
    action = createDecisionForNewMandatarisAndPerson;
  } else if (req.query.fraction) {
    action = createDecisionForUnknownFraction;
  } else if (req.query.unknownMandaat) {
    action = createDecisionForUnknownMandaat;
  } else if (req.query.incompletePerson) {
    action = createDecisionForIncompleteNewPerson;
  } else if (req.query.changeFractionName) {
    action = createDecisionForKnownMandatarisChangeFractionName;
  } else if (req.query.newBeleidsdomein) {
    action = createDecisionForKnownMandatarisNewBeleidsdomein;
  }
  try {
    await action();
  } catch (error) {
    res.status(500).send({ status: 'error', error: error.message });
    return;
  }
  res.status(200).send({ status: 'ok' });
});

mockRouter.get('/clear-decisions', async (_req: Request, res: Response) => {
  //the mock functions here will create inconsistent states in the consumer graph. Clear it using this endpoint
  const query = `
    DELETE {
      GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
        ?s ?p ?o.
      }
    } WHERE {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
     ?s ?p ?o.
    }
  }`;
  await updateSudo(query);
  res.status(200).send({ status: 'ok' });
});

const createDecisionForKnownMandatarisAndPerson = async () => {
  const today = sparqlEscapeDateTime(new Date());
  const id = uuidv4();
  const mandatarisId = '5FF2DC1278A81C0009000A15';
  const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;
  const persoonId =
    '1656cfde62b97fe365c5bc3813a8d7d4a76f0e14b1b9aacf4ae9e8558347aeb6';
  const persoon = `<http://data.lblod.info/id/personen/${persoonId}>`;
  const mandaat =
    '<http://data.lblod.info/id/mandaten/d6b41c777b0a9bd09de458aaeac797d041d6b48d4220e5cc4e21ce20f81d136c>';
  const fractie =
    '<http://data.lblod.info/id/fracties/5C7F7E68D5BECA000900000D>';

  const membershipId = uuidv4();
  const membership = `<http://data.lblod.info/id/lidmaatschappen/${membershipId}>`;

  const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
      <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
        mu:uuid """${id}""";
        mandaat:bekrachtigtOntslagVan ${mandataris}.

      ${mandataris} a mandaat:Mandataris;
        mu:uuid """${mandatarisId}""";
        mandaat:isBestuurlijkeAliasVan ${persoon};
        mandaat:start ${today} ;
        org:holds ${mandaat}.

      ${mandataris} org:hasMembership ${membership}.
      ${membership} a org:Membership;
        org:organisation ${fractie} .
    }
  }
  `;
  await updateSudo(insertQuery);
};

const createDecisionForKnownMandatarisNewBeleidsdomein = async () => {
  const today = sparqlEscapeDateTime(new Date());
  const id = uuidv4();
  const mandatarisId = '5FF2DC1278A81C0009000A15';
  const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;
  const persoonId =
    '1656cfde62b97fe365c5bc3813a8d7d4a76f0e14b1b9aacf4ae9e8558347aeb6';
  const persoon = `<http://data.lblod.info/id/personen/${persoonId}>`;
  const mandaat =
    '<http://data.lblod.info/id/mandaten/d6b41c777b0a9bd09de458aaeac797d041d6b48d4220e5cc4e21ce20f81d136c>';
  const fractie =
    '<http://data.lblod.info/id/fracties/5C7F7E68D5BECA000900000D>';

  const membershipId = uuidv4();
  const membership = `<http://data.lblod.info/id/lidmaatschappen/${membershipId}>`;

  const beleidsdomeinId = uuidv4();
  const beleidsdomeinName = 'foobar';
  const beleidsdomeinUri = `<http://data.lblod.info/id/beleidsdomeinen/${beleidsdomeinId}>`;

  const existingBeleidsdomeinUri = `<http://data.vlaanderen.be/id/concept/BeleidsdomeinCode/5C0E5AD998360D0009000056>`;

  const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
      <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
        mu:uuid """${id}""";
        mandaat:bekrachtigtOntslagVan ${mandataris}.

      ${mandataris} a mandaat:Mandataris;
        mu:uuid """${mandatarisId}""";
        mandaat:isBestuurlijkeAliasVan ${persoon};
        mandaat:start ${today} ;
        org:holds ${mandaat}.

      ${mandataris} org:hasMembership ${membership}.
      ${membership} a org:Membership;
        org:organisation ${fractie} .

      ${mandataris} mandaat:beleidsdomein ${beleidsdomeinUri}, ${existingBeleidsdomeinUri}.
      ${beleidsdomeinUri} a mandaat:Beleidsdomein;
        skos:prefLabel "${beleidsdomeinName}" .
      ${existingBeleidsdomeinUri} a mandaat:Beleidsdomein;
        skos:prefLabel "FAIL SHOULD NOT CHANGE" .
    }
  }
  `;
  await updateSudo(insertQuery);
};

const createDecisionForKnownMandatarisChangeFractionName = async () => {
  const today = sparqlEscapeDateTime(new Date());
  const id = uuidv4();
  const mandatarisId = '5FF2DC1278A81C0009000A15';
  const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;
  const persoonId =
    '1656cfde62b97fe365c5bc3813a8d7d4a76f0e14b1b9aacf4ae9e8558347aeb6';
  const persoon = `<http://data.lblod.info/id/personen/${persoonId}>`;
  const mandaat =
    '<http://data.lblod.info/id/mandaten/d6b41c777b0a9bd09de458aaeac797d041d6b48d4220e5cc4e21ce20f81d136c>';
  const fractie =
    '<http://data.lblod.info/id/fracties/5C7F7E68D5BECA000900000D>';

  const membershipId = uuidv4();
  const membership = `<http://data.lblod.info/id/lidmaatschappen/${membershipId}>`;

  const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX regorg: <https://www.w3.org/ns/regorg#>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
      <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
        mu:uuid """${id}""";
        mandaat:bekrachtigtOntslagVan ${mandataris}.

      ${mandataris} a mandaat:Mandataris;
        mu:uuid """${mandatarisId}""";
        mandaat:isBestuurlijkeAliasVan ${persoon};
        mandaat:start ${today} ;
        org:holds ${mandaat}.

      ${mandataris} org:hasMembership ${membership}.
      ${membership} a org:Membership;
        org:organisation ${fractie} .

      ${fractie} regorg:legalName "New name" ;
        a mandaat:Fractie .
    }
  }
  `;
  await updateSudo(insertQuery);
};

const createDecisionForNewMandatarisAndPerson = async () => {
  const today = sparqlEscapeDateTime(new Date());
  const id = uuidv4();
  const mandatarisId = uuidv4();
  const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;
  const persoonId = uuidv4();
  const persoon = `<http://data.lblod.info/id/personen/${persoonId}>`;
  const mandaat =
    '<http://data.lblod.info/id/mandaten/d6b41c777b0a9bd09de458aaeac797d041d6b48d4220e5cc4e21ce20f81d136c>';
  const fractie =
    '<http://data.lblod.info/id/fracties/5C7F7E68D5BECA000900000D>';

  const membershipId = uuidv4();
  const membership = `<http://data.lblod.info/id/lidmaatschappen/${membershipId}>`;

  const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX person: <http://www.w3.org/ns/person#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX persoon: <http://data.vlaanderen.be/ns/persoon#>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
      <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
        mu:uuid """${id}""";
        mandaat:bekrachtigtOntslagVan ${mandataris}.

      ${mandataris} a mandaat:Mandataris;
        mu:uuid """${mandatarisId}""";
        mandaat:isBestuurlijkeAliasVan ${persoon};
        mandaat:start ${today} ;
        org:holds ${mandaat}.

      ${mandataris} org:hasMembership ${membership}.
      ${membership} a org:Membership;
        org:organisation ${fractie} .

      ${persoon} a person:Person;
        foaf:familyName "Doe";
        persoon:gebruikteVoornaam "John";
        foaf:name "Johnny" .

    }
  }
  `;
  await updateSudo(insertQuery);
};

const createDecisionForUnknownFraction = async () => {
  const today = sparqlEscapeDateTime(new Date());
  const id = uuidv4();
  const mandatarisId = '5FF2DC1278A81C0009000A15';
  const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;
  const persoonId =
    '1656cfde62b97fe365c5bc3813a8d7d4a76f0e14b1b9aacf4ae9e8558347aeb6';
  const persoon = `<http://data.lblod.info/id/personen/${persoonId}>`;
  const mandaat =
    '<http://data.lblod.info/id/mandaten/d6b41c777b0a9bd09de458aaeac797d041d6b48d4220e5cc4e21ce20f81d136c>';
  const fractieId = uuidv4();
  const fractie = `<http://data.lblod.info/id/fracties/${fractieId}>`;

  const membershipId = uuidv4();
  const membership = `<http://data.lblod.info/id/lidmaatschappen/${membershipId}>`;

  const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
      <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
        mu:uuid """${id}""";
        mandaat:bekrachtigtOntslagVan ${mandataris}.

      ${mandataris} a mandaat:Mandataris;
        mu:uuid """${mandatarisId}""";
        mandaat:isBestuurlijkeAliasVan ${persoon};
        mandaat:start ${today} ;
        org:holds ${mandaat}.

      ${mandataris} org:hasMembership ${membership}.
      ${membership} a org:Membership;
        org:organisation ${fractie} .
    }
  }
  `;
  await updateSudo(insertQuery);
};

const createDecisionForUnknownMandaat = async () => {
  const today = sparqlEscapeDateTime(new Date());
  const id = uuidv4();
  const mandatarisId = '5FF2DC1278A81C0009000A15';
  const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;
  const persoonId =
    '1656cfde62b97fe365c5bc3813a8d7d4a76f0e14b1b9aacf4ae9e8558347aeb6';
  const persoon = `<http://data.lblod.info/id/personen/${persoonId}>`;
  const mandaat = `<http://data.lblod.info/id/mandaten/${uuidv4()}>`;
  const fractie =
    '<http://data.lblod.info/id/fracties/5C7F7E68D5BECA000900000D>';

  const membershipId = uuidv4();
  const membership = `<http://data.lblod.info/id/lidmaatschappen/${membershipId}>`;

  const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
      <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
        mu:uuid """${id}""";
        mandaat:bekrachtigtOntslagVan ${mandataris}.

      ${mandataris} a mandaat:Mandataris;
        mu:uuid """${mandatarisId}""";
        mandaat:isBestuurlijkeAliasVan ${persoon};
        mandaat:start ${today} ;
        org:holds ${mandaat}.

      ${mandataris} org:hasMembership ${membership}.
      ${membership} a org:Membership;
        org:organisation ${fractie} .
    }
  }
  `;
  await updateSudo(insertQuery);
};

const createDecisionForIncompleteNewPerson = async () => {
  const today = sparqlEscapeDateTime(new Date());
  const id = uuidv4();
  const mandatarisId = uuidv4();
  const mandataris = `<http://data.lblod.info/id/mandatarissen/${mandatarisId}>`;
  const persoonId = uuidv4();
  const persoon = `<http://data.lblod.info/id/personen/${persoonId}>`;
  const mandaat =
    '<http://data.lblod.info/id/mandaten/d6b41c777b0a9bd09de458aaeac797d041d6b48d4220e5cc4e21ce20f81d136c>';
  const fractie =
    '<http://data.lblod.info/id/fracties/5C7F7E68D5BECA000900000D>';

  const membershipId = uuidv4();
  const membership = `<http://data.lblod.info/id/lidmaatschappen/${membershipId}>`;

  const insertQuery = `
  PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX org: <http://www.w3.org/ns/org#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX person: <http://www.w3.org/ns/person#>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>

  INSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/besluiten-consumed> {
      <http://data.lblod.info/id/besluiten/${id}> a besluit:Besluit;
        mu:uuid """${id}""";
        mandaat:bekrachtigtOntslagVan ${mandataris}.

      ${mandataris} a mandaat:Mandataris;
        mu:uuid """${mandatarisId}""";
        mandaat:isBestuurlijkeAliasVan ${persoon};
        mandaat:start ${today} ;
        org:holds ${mandaat}.

      ${mandataris} org:hasMembership ${membership}.
      ${membership} a org:Membership;
        org:organisation ${fractie} .

      ${persoon} a person:Person;
        foaf:name "Johnny" .

    }
  }
  `;
  await updateSudo(insertQuery);
};
