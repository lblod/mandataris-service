import { fractie } from '../data-access/fractie';

export const fractieUsecase = {
  create,
};

async function create(
  bestuursorganenInTijd: Array<string>,
  bestuurseenheid: string,
): Promise<string> {
  // TODO: check the bestuursorganen and bestuurseenheid
  const newOnafhankelijkeFractie = await fractie.createOnafhankelijkeFractie(
    bestuursorganenInTijd,
    bestuurseenheid,
  );

  return newOnafhankelijkeFractie;
}
