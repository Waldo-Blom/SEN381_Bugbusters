// jest.config.js
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/integration'],
      testMatch: ['**/*.test.js'],
    },
    {
      displayName: 'regression',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/regression'],
      testMatch: ['**/*.test.js'],
    },
  ],
  collectCoverageFrom: ['src/**/*.js', '!src/**/__tests__/**', '!src/server.js'],
};