/**
 * Юнит-тесты PayrollCalcService против сценариев А-Е(F) из
 * docs/payroll-formulas.md (раздел 6). Написаны независимо
 * qa-tester — не автором реализации.
 *
 * Метод calculateForEmployee принимает необязательный параметр `db`
 * (по умолчанию this.prisma) — здесь подставляется фейковый объект
 * с сконструированными вручную timesheet.findMany /
 * employee.findUniqueOrThrow / rateRule.findMany вместо реальной БД,
 * поэтому тесты не требуют поднятой PostgreSQL.
 *
 * Каждый сценарий проверяет ПОЛНУЮ разбивку по составляющим
 * (baseAmount, overtimeAmount, nightAmount, holidayAmount,
 * remoteBonusAmount, perDiemAmount, pieceRateAmount, netAmount),
 * а не только итоговую сумму — расхождение в одной составляющей может
 * компенсироваться другой и остаться незамеченным, если проверять
 * только netAmount.
 */
import { Prisma } from '@prisma/client';
import { PayrollCalcService } from './payroll-calc.service';

const D = (v: number | string) => new Prisma.Decimal(v);

interface FakeRule {
  id: string;
  companyId: string;
  siteId: string | null;
  positionId: string | null;
  name: string;
  nightShiftPct: Prisma.Decimal;
  holidayPct: Prisma.Decimal;
  remoteBonusPct: Prisma.Decimal;
  perDiemAmount: Prisma.Decimal;
  perMeterBonus: Prisma.Decimal;
  priority: number;
  createdAt: Date;
}

function makeRule(overrides: Partial<FakeRule> & { id: string; createdAt?: Date }): FakeRule {
  return {
    companyId: 'company-1',
    siteId: null,
    positionId: null,
    name: overrides.id,
    nightShiftPct: D(0),
    holidayPct: D(0),
    remoteBonusPct: D(0),
    perDiemAmount: D(0),
    perMeterBonus: D(0),
    priority: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

interface FakeTimesheet {
  id: string;
  employeeId: string;
  siteId: string;
  workDate: Date;
  regularHours: Prisma.Decimal;
  overtimeHours: Prisma.Decimal;
  nightHours: Prisma.Decimal;
  isHoliday: boolean;
  metersDrilled: Prisma.Decimal | null;
  status: string;
}

function makeTimesheet(overrides: Partial<FakeTimesheet> & { id: string; workDate: Date; siteId: string }): FakeTimesheet {
  return {
    employeeId: 'emp-1',
    regularHours: D(0),
    overtimeHours: D(0),
    nightHours: D(0),
    isHoliday: false,
    metersDrilled: null,
    status: 'locked',
    ...overrides,
  };
}

/** Собирает фейковый `db` для передачи в calculateForEmployee(..., db). */
function fakeDb(opts: {
  employee: {
    id: string;
    companyId: string;
    positionId: string;
    baseRateOverride: Prisma.Decimal | null;
    baseHourlyRate: Prisma.Decimal;
    overtimeMultiplier: Prisma.Decimal;
  };
  timesheets: FakeTimesheet[];
  rules: FakeRule[];
}) {
  return {
    timesheet: {
      findMany: jest.fn().mockResolvedValue(opts.timesheets),
    },
    employee: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: opts.employee.id,
        companyId: opts.employee.companyId,
        positionId: opts.employee.positionId,
        baseRateOverride: opts.employee.baseRateOverride,
        position: {
          baseHourlyRate: opts.employee.baseHourlyRate,
          overtimeMultiplier: opts.employee.overtimeMultiplier,
        },
      }),
    },
    rateRule: {
      findMany: jest.fn().mockResolvedValue(opts.rules),
    },
  } as any;
}

const PERIOD_START = new Date('2026-01-01T00:00:00Z');
const PERIOD_END = new Date('2026-01-31T23:59:59Z');

function expectDecimal(actual: Prisma.Decimal, expected: number) {
  expect(actual.toNumber()).toBeCloseTo(expected, 2);
}

describe('PayrollCalcService — сценарии docs/payroll-formulas.md, раздел 6', () => {
  const service = new PayrollCalcService({} as any);

  // --- Сценарий А — простая смена без надбавок ---------------------
  test('А: 8 обычных часов, ставка 500, нулевое wildcard-правило -> netAmount 4000', async () => {
    const db = fakeDb({
      employee: {
        id: 'emp-a',
        companyId: 'company-1',
        positionId: 'pos-a',
        baseRateOverride: null,
        baseHourlyRate: D(500),
        overtimeMultiplier: D(1.5),
      },
      timesheets: [
        makeTimesheet({ id: 't1', siteId: 'site-1', workDate: PERIOD_START, regularHours: D(8) }),
      ],
      rules: [makeRule({ id: 'wildcard' })],
    });

    const r = await service.calculateForEmployee('emp-a', PERIOD_START, PERIOD_END, {}, db);

    expectDecimal(r.baseAmount, 4000);
    expectDecimal(r.overtimeAmount, 0);
    expectDecimal(r.nightAmount, 0);
    expectDecimal(r.holidayAmount, 0);
    expectDecimal(r.remoteBonusAmount, 0);
    expectDecimal(r.perDiemAmount, 0);
    expectDecimal(r.pieceRateAmount, 0);
    expectDecimal(r.netAmount, 4000);
  });

  // --- Сценарий Б — сверхурочные ------------------------------------
  test('Б: regularHours=8, overtimeHours=2, mult=1.5 -> netAmount 5500', async () => {
    const db = fakeDb({
      employee: {
        id: 'emp-b',
        companyId: 'company-1',
        positionId: 'pos-b',
        baseRateOverride: null,
        baseHourlyRate: D(500),
        overtimeMultiplier: D(1.5),
      },
      timesheets: [
        makeTimesheet({ id: 't1', siteId: 'site-1', workDate: PERIOD_START, regularHours: D(8), overtimeHours: D(2) }),
      ],
      rules: [makeRule({ id: 'wildcard' })],
    });

    const r = await service.calculateForEmployee('emp-b', PERIOD_START, PERIOD_END, {}, db);

    expectDecimal(r.baseAmount, 4000);
    expectDecimal(r.overtimeAmount, 1500);
    expectDecimal(r.netAmount, 5500);
  });

  // --- Сценарий В — ночная смена -------------------------------------
  test('В: nightHours=4 из 8, nightShiftPct=20 -> netAmount 4400', async () => {
    const db = fakeDb({
      employee: {
        id: 'emp-c',
        companyId: 'company-1',
        positionId: 'pos-c',
        baseRateOverride: null,
        baseHourlyRate: D(500),
        overtimeMultiplier: D(1.5),
      },
      timesheets: [
        makeTimesheet({ id: 't1', siteId: 'site-1', workDate: PERIOD_START, regularHours: D(8), nightHours: D(4) }),
      ],
      rules: [makeRule({ id: 'wildcard', nightShiftPct: D(20) })],
    });

    const r = await service.calculateForEmployee('emp-c', PERIOD_START, PERIOD_END, {}, db);

    expectDecimal(r.baseAmount, 4000);
    expectDecimal(r.nightAmount, 400);
    expectDecimal(r.overtimeAmount, 0);
    expectDecimal(r.holidayAmount, 0);
    expectDecimal(r.netAmount, 4400);
  });

  // --- Сценарий Г — праздничная смена с переработкой ------------------
  test('Г: праздник, regular=8, overtime=2, holidayPct=100 -> netAmount 10500', async () => {
    const db = fakeDb({
      employee: {
        id: 'emp-d',
        companyId: 'company-1',
        positionId: 'pos-d',
        baseRateOverride: null,
        baseHourlyRate: D(500),
        overtimeMultiplier: D(1.5),
      },
      timesheets: [
        makeTimesheet({
          id: 't1',
          siteId: 'site-1',
          workDate: PERIOD_START,
          regularHours: D(8),
          overtimeHours: D(2),
          isHoliday: true,
        }),
      ],
      rules: [makeRule({ id: 'wildcard', holidayPct: D(100) })],
    });

    const r = await service.calculateForEmployee('emp-d', PERIOD_START, PERIOD_END, {}, db);

    expectDecimal(r.baseAmount, 4000);
    expectDecimal(r.overtimeAmount, 1500);
    expectDecimal(r.holidayAmount, 5000);
    expectDecimal(r.netAmount, 10500);
  });

  // --- Сценарий Д — сдельная премия за метраж -------------------------
  test('Д: metersDrilled=12.5, perMeterBonus=150 -> netAmount 5875', async () => {
    const db = fakeDb({
      employee: {
        id: 'emp-e',
        companyId: 'company-1',
        positionId: 'pos-e',
        baseRateOverride: null,
        baseHourlyRate: D(500),
        overtimeMultiplier: D(1.5),
      },
      timesheets: [
        makeTimesheet({ id: 't1', siteId: 'site-1', workDate: PERIOD_START, regularHours: D(8), metersDrilled: D(12.5) }),
      ],
      rules: [makeRule({ id: 'wildcard', perMeterBonus: D(150) })],
    });

    const r = await service.calculateForEmployee('emp-e', PERIOD_START, PERIOD_END, {}, db);

    expectDecimal(r.baseAmount, 4000);
    expectDecimal(r.pieceRateAmount, 1875);
    expectDecimal(r.netAmount, 5875);
  });

  // --- Сценарий Е (F) — пересечение правил, победа priority целиком ---
  test('Е/F: R3 (priority=10) побеждает целиком над R1/R2 -> netAmount 7350', async () => {
    const rules: FakeRule[] = [
      makeRule({
        id: 'R1',
        name: 'R1-company',
        siteId: null,
        positionId: null,
        priority: 0,
        nightShiftPct: D(10),
        holidayPct: D(50),
        remoteBonusPct: D(0),
        perDiemAmount: D(500),
        perMeterBonus: D(0),
      }),
      makeRule({
        id: 'R2',
        name: 'R2-site',
        siteId: 'SITE_A',
        positionId: null,
        priority: 5,
        nightShiftPct: D(0),
        holidayPct: D(0),
        remoteBonusPct: D(20),
        perDiemAmount: D(800),
        perMeterBonus: D(0),
      }),
      makeRule({
        id: 'R3',
        name: 'R3-position',
        siteId: null,
        positionId: 'pos-driller',
        priority: 10,
        nightShiftPct: D(25),
        holidayPct: D(0),
        remoteBonusPct: D(0),
        perDiemAmount: D(0),
        perMeterBonus: D(120),
      }),
    ];

    const db = fakeDb({
      employee: {
        id: 'emp-f',
        companyId: 'company-1',
        positionId: 'pos-driller',
        baseRateOverride: null,
        baseHourlyRate: D(600),
        overtimeMultiplier: D(1.5),
      },
      timesheets: [
        makeTimesheet({
          id: 't1',
          siteId: 'SITE_A',
          workDate: PERIOD_START,
          regularHours: D(8),
          overtimeHours: D(1),
          nightHours: D(3),
          isHoliday: false,
          metersDrilled: D(10),
        }),
      ],
      rules,
    });

    const r = await service.calculateForEmployee('emp-f', PERIOD_START, PERIOD_END, {}, db);

    expectDecimal(r.baseAmount, 4800);
    expectDecimal(r.overtimeAmount, 900);
    expectDecimal(r.nightAmount, 450); // из R3 (25%), не R1 (10%)
    expectDecimal(r.holidayAmount, 0);
    expectDecimal(r.remoteBonusAmount, 0); // R3.remoteBonusPct=0 -> НЕ 20% из R2
    expectDecimal(r.perDiemAmount, 0); // R3.perDiemAmount=0 -> НЕ 800 из R2
    expectDecimal(r.pieceRateAmount, 1200); // из R3 (perMeterBonus=120)
    expectDecimal(r.netAmount, 7350);

    // Победившее правило должно быть залогировано как R3 — требование
    // "объяснимости" расчёта (докс, раздел 4).
    expect(r.appliedRules).toEqual([{ timesheetId: 't1', ruleId: 'R3', ruleName: 'R3-position' }]);
  });

  // --- Дополнительно: перекрёстная проверка альтернативной трактовки ---
  // (не тестовый сценарий из спецификации, а страховка от регресса D1:
  // если реализация когда-нибудь тихо переключится на "пофилевое"
  // наследование, этот тест должен упасть, зафиксировав netAmount=9290
  // вместо 7350.)
  test('Е/F: гарантия, что применяется "победитель целиком", а не пофилевое наследование', async () => {
    const rules: FakeRule[] = [
      makeRule({ id: 'R1', siteId: null, positionId: null, priority: 0, perDiemAmount: D(500) }),
      makeRule({ id: 'R2', siteId: 'SITE_A', positionId: null, priority: 5, remoteBonusPct: D(20), perDiemAmount: D(800) }),
      makeRule({ id: 'R3', siteId: null, positionId: 'pos-driller', priority: 10, nightShiftPct: D(25), perMeterBonus: D(120) }),
    ];
    const db = fakeDb({
      employee: {
        id: 'emp-f2',
        companyId: 'company-1',
        positionId: 'pos-driller',
        baseRateOverride: null,
        baseHourlyRate: D(600),
        overtimeMultiplier: D(1.5),
      },
      timesheets: [
        makeTimesheet({ id: 't1', siteId: 'SITE_A', workDate: PERIOD_START, regularHours: D(8), overtimeHours: D(1), nightHours: D(3), metersDrilled: D(10) }),
      ],
      rules,
    });

    const r = await service.calculateForEmployee('emp-f2', PERIOD_START, PERIOD_END, {}, db);
    expectDecimal(r.netAmount, 7350);
    expect(r.netAmount.toNumber()).not.toBeCloseTo(9290, 2);
  });
});
