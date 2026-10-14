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
      displayName: 'functional',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/functional'],
      testMatch: ['**/*.test.js'],
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/e2e'],
      testMatch: ['**/*.test.js'],
    },
  ],
};
