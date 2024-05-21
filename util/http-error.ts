export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: string[] | null = null,
  ) {
    super(message);
  }
}
