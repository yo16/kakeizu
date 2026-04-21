import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // next.config.ts と .env ファイルを読み込むための Next.js アプリのパスを指定
  dir: './',
});

const config: Config = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
  ],
};

export default createJestConfig(config);
