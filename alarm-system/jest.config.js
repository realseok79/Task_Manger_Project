module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom', // We are testing DOM logic in client-side AlarmManager
  testMatch: ['**/tests/**/*.test.ts'],
};
