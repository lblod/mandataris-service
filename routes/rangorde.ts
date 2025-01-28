import Router from 'express-promise-router';

import { update, sparqlEscapeString } from 'mu';

import { Request, Response } from 'express';

import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';
import { isValidId, RDF_TYPE } from '../util/valid-id';

const rangordeRouter = Router();

type RangordeDiff = {
  mandatarisId: string;
  rangorde: string;
};

rangordeRouter.post(
  '/update-rangordes/',
  async (req: Request, res: Response) => {
    const { mandatarissen } = req.body;
    console.log(mandatarissen);

    try {
      await updateRangordes(mandatarissen);
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

async function updateRangordes(mandatarissen: RangordeDiff[]): Promise<void> {
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

export { rangordeRouter };
