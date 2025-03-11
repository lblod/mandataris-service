import type { Config } from '@jest/types';
// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: './delta-receiver.js',
  testSequencer: './testSequencer.js',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};
export default config;
