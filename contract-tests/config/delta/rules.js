export default [
  {
    match: {
      subject: {},
    },
    callback: {
      url: 'http://tests/delta',
      method: 'POST',
    },
    options: {
      resourceFormat: 'v0.0.1',
      gracePeriod: 10,
      ignoreFromSelf: true,
    },
  },
];
