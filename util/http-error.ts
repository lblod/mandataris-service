export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public description: string[] | null = null,
  ) {
    super(message);
  }
}
