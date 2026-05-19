export default {
  displayName: 'warehouse-feature',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/warehouse/feature',
  moduleNameMapper: {
    '^@autoflow/shared-prisma$': '<rootDir>/../../shared-prisma/src/index.ts',
    '^@autoflow/shared-types$': '<rootDir>/../../shared-types/src/index.ts',
    '^@autoflow/shared-errors$': '<rootDir>/../../shared-errors/src/index.ts',
    '^@autoflow/shared-auth$': '<rootDir>/../../shared-auth/src/index.ts',
    '^@autoflow/warehouse-data-access$': '<rootDir>/../data-access/src/index.ts',
  },
};
