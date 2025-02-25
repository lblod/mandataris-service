import { codelijstRepository } from '../data-access/codelijst';

export const codelijstUsecase = {
  conceptHasImplementation,
};

async function conceptHasImplementation(conceptId: string) {
  // TODO: check if valid concept
  return await codelijstRepository.findConceptImplementation(conceptId);
}
