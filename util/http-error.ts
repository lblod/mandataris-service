import { STATUS_CODE } from './constants';

export class HttpError extends Error {
  constructor(
    message: string,
    public status?: number,
    public description?: string[],
  ) {
    super(message);

    if (!this.status) {
      this.status = STATUS_CODE.INTERNAL_SERVER_ERROR;
    }
    if (!this.description) {
      this.description = null;
    }
    console.log('\n Http error: ', this.message);
  }
}
