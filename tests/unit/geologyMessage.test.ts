import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGeologyDayMessage, pluralProb } from '../../src/lib/geologyMessage.ts'

// Запуск: npm run test:unit  (Node 22+: node --experimental-strip-types --test)
// Эталон — реальная сводка старшего геолога из WhatsApp за 02.10.2026.

test('pluralProb склоняет слово «проба»', () => {
  assert.equal(pluralProb(1), 'проба')
  assert.equal(pluralProb(2), 'пробы')
  assert.equal(pluralProb(5), 'проб')
  assert.equal(pluralProb(11), 'проб')
  assert.equal(pluralProb(21), 'проба')
  assert.equal(pluralProb(29), 'проб')
})

test('сводка геологов: итог распиловки и блоки скважин', () => {
  const text = buildGeologyDayMessage({
    date: '2026-10-02',
    hour: 20,
    wells: [
      {
        wellLabel: 'ZKY11301',
        docs: [{ kind: 'geotechnical', meters: 69.5, total: 599.5, finished: true, photoDone: true }],
        saw: [{ shift: 1, meters: 30.7 }],
        samples: [],
        layoutDone: true,
      },
      {
        wellLabel: 'ZKY11501',
        docs: [{ kind: 'geological', meters: 50, total: 503.2, finished: false, photoDone: true }],
        saw: [
          { shift: 2, meters: 75.1 },
          { shift: 1, meters: 8.6 },
        ],
        samples: [{ typeName: 'Объёмный вес', quantity: 29 }],
        layoutDone: false,
      },
    ],
  })

  assert.match(text, /^Добрый вечер сводка за 02\.10\.2026/)
  assert.match(text, /69\.5м геотехнической документации общий метраж 599\.5м документация закончилась разбивка на опробование/)
  assert.match(text, /50м геологической документации общий метраж 503\.2м отбор проб на объёмный вес/)
  assert.match(text, /Ночь-75\.1м ZKY11501/)
  assert.match(text, /И того: 114\.4м/)
  assert.match(text, /Фото документация\nZKY11301\nZKY11501/)
  assert.match(text, /Отбор проб\nZKY11501 - 29 проб/)
})

test('пустая сводка содержит только приветствие', () => {
  const text = buildGeologyDayMessage({ date: '2026-10-02', hour: 9, wells: [] })
  assert.equal(text, 'Доброе утро сводка за 02.10.2026')
})
