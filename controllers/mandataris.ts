import { mandataris } from '../data-access/mandataris';

export const mandatarisUsecase = {
  isActive,
};

async function isActive(mandatarisId: string | undefined): Promise<boolean> {
  if (!mandatarisId) {
    return false;
  }

  return mandataris.isActive(mandatarisId);
}
