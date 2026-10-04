import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePlannedWells } from '../../src/lib/plannedWellsParse.ts'

test('вставка из Excel (табуляция, десятичная запятая) с заголовком', () => {
  const text = [
    'Номер\tШирота\tДолгота\tX\tY\tОтметка\tГлубина\tУгол\tАзимут\tОписание',
    'ZKY-1\t47,5123\t70,1234\t1000\t2000\t350\t600\t-90\t0\tРазведочная',
    'ZKY-2\t47.52\t70.13\t1010\t2010\t351\t450\t-75\t180\tВторая скважина',
  ].join('\n')
  const rows = parsePlannedWells(text)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].errors.length, 0)
  assert.equal(rows[0].draft?.coord_wgs84_lat, 47.5123)
  assert.equal(rows[1].draft?.azimuth, 180)
})

test('ошибки: пустое описание, дубликат номера, нечисловое значение', () => {
  const text = ['A-1;47.1;70.1;1;2;3;100;-90;0;', 'A-1;47.1;70.1;1;2;3;100;-90;0;дубль', 'B-1;abc;70.1;1;2;3;100;-90;0;текст'].join('\n')
  const rows = parsePlannedWells(text, ['Старая'])
  assert.ok(rows[0].errors.includes('Описание не указано'))
  assert.ok(rows[1].errors.includes('Номер повторяется в списке'))
  assert.ok(rows[2].errors.some((e) => e.startsWith('Широта')))
})

test('номер, уже существующий на участке, отклоняется', () => {
  const rows = parsePlannedWells('ZKY-9;47;70;1;2;3;100;-90;0;текст', ['zky-9'])
  assert.ok(rows[0].errors.includes('Номер уже есть на участке'))
})
