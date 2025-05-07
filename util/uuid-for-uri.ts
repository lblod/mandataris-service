export function getIdentifierFromUri(uri: string) {
  const uuid = uri.split('/').pop();
  if (
    uuid &&
    uuid
      .toLocaleLowerCase()
      .match(
        '(^[a-f0-9]{8}(-)?[a-f0-9]{4}(-)?[a-f0-9]{4}(-)?[a-f0-9]{4}(-)?[a-f0-9]{12}$)',
      )
  ) {
    return uuid;
  } else {
    return null;
  }
}
