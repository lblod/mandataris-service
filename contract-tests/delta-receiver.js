/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const express = require('express');
const bodyParser = require('body-parser');
const { querySudo } = require('@lblod/mu-auth-sudo');

const NodeEnvironment = require('jest-environment-node').TestEnvironment;

async function waitForDatabase() {
  let maxRetries = 20;
  while (maxRetries > 0) {
    try {
      const result = await querySudo('SELECT * WHERE { ?s ?p ?o } LIMIT 1');
      if (result.results.bindings.length > 0) {
        // somehow we still get failed queries for a bit after the db is ready
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log('Database ready');
        return;
      } else {
        throw new Error('No data in the database (yet?)');
      }
    } catch (e) {
      console.log('Database not ready yet, retrying in 1s');
    } finally {
      maxRetries--;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

class ExpressEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
  }

  async setup() {
    await waitForDatabase();
    await super.setup();
    let server;
    const deltas = [];
    const app = express();
    app.use(bodyParser.json());
    app.post('/delta', (req, res) => {
      res.send('ok').status(200);
      const body = req.body;
      deltas.push(body);
    });
    await new Promise(function (resolve) {
      server = app.listen(80, function () {
        let address = server.address();
        console.log(` Running server on '${JSON.stringify(address)}'...`);
        resolve();
      });
    });
    let address = server.address();
    this.global.server = server;
    this.global.deltas = deltas;
    this.global.address = `${address.address}:${address.port}`;
  }
  async teardown() {
    this.global.server.close();
    await super.teardown();
  }

  runScript(script) {
    return super.runScript(script);
  }
}

module.exports = ExpressEnvironment;
