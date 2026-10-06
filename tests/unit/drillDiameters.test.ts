import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paintIntervals } from '../../src/lib/drillDiameters.ts'

test('расширение перекрывает ранее пробуренный диаметр на своём участке', () => {
  const res = paintIntervals([
    { code: 'PQ', from: 0, to: 10.7 },
    { code: 'HQ', from: 10.7, to: 45.9 },
    { code: 'PQ', from: 10.7, to: 27 },
  ])
  assert.deepEqual(res, [
    { code: 'PQ', from: 0, to: 27 },
    { code: 'HQ', from: 27, to: 45.9 },
  ])
})

test('подряд идущие интервалы одного диаметра склеиваются, пустые игнорируются', () => {
  const res = paintIntervals([
    { code: 'PQ', from: 0, to: 5 },
    { code: 'PQ', from: 5, to: 10 },
    { code: 'HQ', from: 10, to: 10 },
  ])
  assert.deepEqual(res, [{ code: 'PQ', from: 0, to: 10 }])
})
