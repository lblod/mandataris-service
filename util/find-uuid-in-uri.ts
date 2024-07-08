export function findUuidFromUri(uri: string) {
  const regex = new RegExp(
    /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{24})$/,
  );
  const match = uri.match(regex);

  return match ? match[0] : null;
}
