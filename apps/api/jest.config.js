/**
 * Конфигурация Jest для apps/api. Отсутствовала в репозитории — добавлена
 * qa-tester вместе с первыми юнит-тестами (Этап 05), т.к. `npm test`
 * (jest без конфига) не находил .spec.ts и не умел компилировать TS.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
};
