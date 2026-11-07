import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dateToString, temporalToHuman } from '../src/utils/temporal.js';
import { temporalWords } from '../src/utils/temporalLocale.js';

const { cases } = JSON.parse(readFileSync(new URL('./fixtures/temporal-locale/cases.json', import.meta.url), 'utf8'));

test('temporalToHuman: the shared cases by language (also run on the server)', () => {
  for (const item of cases.filter((entry) => !entry.mode)) {
    assert.equal(temporalToHuman(item.value, { language: item.language }), item.expected, JSON.stringify(item));
  }
});

test('temporalToHuman: temporal JSON text is read like the parsed object', () => {
  const text = JSON.stringify({ timestamp: { in: '1850', circa: true } });
  assert.equal(temporalToHuman(text, { language: 'fre' }), 'vers 1850');
});

test('temporalToHuman: months of 30 days', () => {
  const april = { start: { earliest: '1850-04-01' }, end: { latest: '1850-04-30' }, estMinDate: 1850.0401, estMaxDate: 1850.043 };
  assert.equal(temporalToHuman(april, { language: 'eng' }), 'April 1850');
  const part = { start: { earliest: '1850-04-02' }, end: { latest: '1850-04-30' }, estMinDate: 1850.0402, estMaxDate: 1850.043 };
  assert.equal(temporalToHuman(part, { language: 'eng' }), '2 Apr 1850 to 30 Apr 1850', 'not the whole month');
});

test('dateToString: language is the third argument', () => {
  assert.equal(dateToString('1969-05-03', null, 'fre'), '3 mai 1969');
  assert.equal(dateToString('1969-05-03', 'Hijri', 'fre'), '1969-05-03', 'a native calendar keeps its numbers');
});

test('temporalWords: every language has all the words of English', () => {
  const english = temporalWords('eng');
  const french = temporalWords('fre');
  assert.deepEqual(Object.keys(french).sort(), Object.keys(english).sort());
  assert.equal(french.months.length, 12);
  assert.equal(french.monthsLong.length, 12);
});
