import { fractie } from '../data-access/fractie';
import { mandataris } from '../data-access/mandataris';

import { areIdsValid, RDF_TYPE } from '../util/valid-id';
import { STATUS_CODE } from '../util/constants';
import { HttpError } from '../util/http-error';

export const fractieUsecase = {
  forBestuursperiode,
  removeFractieWhenNoLidmaatschap,
  createReplacement,
};

async function forBestuursperiode(
  bestuursperiodeId: string,
  onafhankelijk,
): Promise<Array<string>> {
  const isBestuursperiode = await areIdsValid(RDF_TYPE.BESTUURSPERIODE, [
    bestuursperiodeId,
  ]);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const fractieResult = await fractie.forBestuursperiode(
    bestuursperiodeId,
    onafhankelijk,
  );

  if (fractieResult.length === 0) {
    return [];
  }

  return fractieResult.map((result) => result.fractieId?.value);
}

async function removeFractieWhenNoLidmaatschap(
  bestuursperiodeId: string,
): Promise<Array<string>> {
  const isBestuursperiode = await areIdsValid(RDF_TYPE.BESTUURSPERIODE, [
    bestuursperiodeId,
  ]);
  if (!isBestuursperiode) {
    throw new HttpError(
      `Bestuursperiode with id ${bestuursperiodeId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }

  return await fractie.removeFractieWhenNoLidmaatschap(bestuursperiodeId);
}

async function createReplacement(
  currentFractieId: string,
  fractieLabel?: string,
  endDate?: Date,
): Promise<void> {
  const isFractie = await areIdsValid(RDF_TYPE.FRACTIE, [currentFractieId]);
  if (!isFractie) {
    throw new HttpError(
      `Fractie with id ${currentFractieId} not found.`,
      STATUS_CODE.BAD_REQUEST,
    );
  }
  if (!fractieLabel || fractieLabel?.trim() === '') {
    throw new HttpError(
      'Replacement fractie label cannot be empty',
      STATUS_CODE.BAD_REQUEST,
    );
  }
  if (!endDate) {
    throw new HttpError(
      'An endDate is required but not found.',
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const canReplaceFractie = await fractie.canReplaceFractie(currentFractieId);
  if (!canReplaceFractie) {
    throw new HttpError(
      'Fractions that have ended cannot be replaced.',
      STATUS_CODE.BAD_REQUEST,
    );
  }

  const replacementUri = await fractie.replaceFractie(
    currentFractieId,
    fractieLabel,
    endDate,
  );
  await mandataris.createNewMandatarissenForFractieReplacement(
    currentFractieId,
    replacementUri,
    endDate,
  );
}
