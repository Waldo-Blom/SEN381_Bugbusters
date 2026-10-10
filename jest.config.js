module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.test.js'],
    },
    {
      // API / integration tests, including tests/health.test.js at the tests/ root.
      displayName: 'integration',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests'],
      testMatch: ['**/*.test.js'],
      testPathIgnorePatterns: ['/node_modules/', '/tests/regression/', '/tests/e2e/'],
    },
    {
      displayName: 'regression',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/regression'],
      testMatch: ['**/*.test.js'],
    },
    {
      // Critical user journeys against a running server (BASE_URL).
      displayName: 'e2e',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/e2e'],
      testMatch: ['**/*.test.js'],
      testTimeout: 30000,
    },
  ],
  // Coverage options only work at the top level.
  collectCoverageFrom: ['src/**/*.js', '!src/**/__tests__/**', '!src/server.js'],
};