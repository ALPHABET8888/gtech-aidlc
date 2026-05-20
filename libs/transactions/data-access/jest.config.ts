export default {
  displayName: 'transactions-data-access',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/transactions/data-access',
  moduleNameMapper: {
    '^@autoflow/shared-prisma$': '<rootDir>/../../shared-prisma/src/index.ts',
    '^@autoflow/shared-types$': '<rootDir>/../../shared-types/src/index.ts',
  },
};
