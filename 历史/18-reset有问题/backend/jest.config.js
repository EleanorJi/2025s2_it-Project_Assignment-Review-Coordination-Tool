module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/config/**',
    '!src/templates/**'
  ],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js',
    '**/*.spec.js'
  ],
  coverageThreshold: {
    global: {
      branches: 3,
      functions: 3,
      lines: 3,
      statements: 3
    }
  },
  testTimeout: 10000
};

