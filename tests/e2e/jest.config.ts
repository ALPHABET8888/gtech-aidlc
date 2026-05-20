export default {
  displayName: 'e2e',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/tests/e2e',
  testTimeout: 30000,
  moduleNameMapper: {
    '^@autoflow/shared-prisma$': '<rootDir>/../../libs/shared-prisma/src/index.ts',
    '^@autoflow/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@autoflow/shared-auth$': '<rootDir>/../../libs/shared-auth/src/index.ts',
    '^@autoflow/shared-errors$': '<rootDir>/../../libs/shared-errors/src/index.ts',
    '^@autoflow/transactions-data-access$': '<rootDir>/../../libs/transactions/data-access/src/index.ts',
    '^@autoflow/transactions-feature$': '<rootDir>/../../libs/transactions/feature/src/index.ts',
  },
};
