module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.spec.ts', '<rootDir>/tests/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  // Polyfill Reflect.metadata AVANT l'import des DTO — sans lui, les
  // décorateurs class-validator/class-transformer ne s'enregistrent pas
  // correctement et les payloads valides sont rejetés (statut « invalid »).
  setupFiles: ['reflect-metadata'],
};