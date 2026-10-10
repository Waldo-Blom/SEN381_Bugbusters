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
      displayName: 'e2e',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/e2e'],
      testMatch: ['**/*.test.js'],
    },
  ],
  collectCoverageFrom: ['src/**/*.js', '!src/**/__tests__/**', '!src/server.js'],
};
