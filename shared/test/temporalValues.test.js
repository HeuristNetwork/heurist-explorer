/**
 * @file temporalValues.test.js
 * @brief Values of the temporal editor (plan 19): stored value -> form values ->
 *        stored value for the four kinds, reading rules and checks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decimalToYMD, formToTemporal, isTemporalObject, rangeApart, temporalToForm, validateTemporal
} from '../src/widgets/temporal/temporalValues.js';
import { inputType } from '../src/widgets/edit-form/HEditField.js';

const parsed = (text) => JSON.parse(text);

test('simple date: plain text, precision, time and zone, determination and comment', () => {
  assert.deepEqual(temporalToForm(''), { kind: 's', values: {} });
  assert.deepEqual(temporalToForm('1624'), { kind: 's', values: { date: '1624' } });
  assert.equal(formToTemporal('s', { date: '1624', approx: 'exact', determination: 0 }), '1624', 'a date alone stays plain text');
  assert.equal(formToTemporal('s', { date: '-375' }), '-375');
  assert.equal(formToTemporal('s', { date: '' }), '');

  // rec 151 of osmak_mapping
  const stored = '{"timestamp":{"in":"1969","type":"s","before":true},"comment":"1970","estMinDate":1969,"estMaxDate":1969}';
  const form = temporalToForm(stored);
  assert.equal(form.kind, 's');
  assert.deepEqual(form.values, { comment: '1970', date: '1969', approx: 'before' });
  assert.deepEqual(parsed(formToTemporal('s', form.values)),
    { timestamp: { in: '1969', type: 's', before: true }, comment: '1970' }, 'est dates are left to the server');

  const timed = formToTemporal('s', { date: '1969-05-03', time: '10:20', zone: '2', approx: 'circa', determination: 1 });
  assert.deepEqual(parsed(timed), { timestamp: { in: '1969-05-03 10:20 +2', type: 's', circa: true }, determination: 1 });
  assert.deepEqual(temporalToForm(timed).values,
    { determination: 1, date: '1969-05-03', time: '10:20', zone: '+2', approx: 'circa' });
  assert.equal(parsed(formToTemporal('s', { date: '1969', zone: '+2', comment: 'x' })).timestamp.in, '1969', 'no zone without a time');
});

test('simple range and fuzzy range', () => {
  const range = formToTemporal('r', { earliest: '1850', latest: '1860-06', profile: 1, determination: 2, comment: 'c' });
  assert.deepEqual(parsed(range), { start: { earliest: '1850' }, end: { latest: '1860-06' }, profile: 1, determination: 2, comment: 'c' });
  assert.deepEqual(temporalToForm(range),
    { kind: 'r', values: { determination: 2, comment: 'c', earliest: '1850', latest: '1860-06', profile: 1 } });

  const fuzzy = formToTemporal('p', { tpq: '1800', pdb: '1810', pde: '', taq: '1850', startProfile: 2, endProfile: 0 });
  assert.deepEqual(parsed(fuzzy), { start: { earliest: '1800', latest: '1810', profile: 2 }, end: { latest: '1850' } });
  assert.deepEqual(temporalToForm(fuzzy), { kind: 'p', values: { tpq: '1800', pdb: '1810', pde: '', taq: '1850', startProfile: 2 } });

  // a fuzzy range without probable dates is read as a simple range (as legacy)
  assert.equal(temporalToForm('{"start":{"earliest":"1800"},"end":{"latest":"1850"}}').kind, 'r');
  assert.equal(temporalToForm('{"start":{"earliest":"1800"},"end":{"earliest":"1840","latest":"1850"}}').kind, 'p');
});

test('radiometric dates', () => {
  const bp = formToTemporal('c', { meanType: 'bp', mean: 3000, devType: 'sym', dev: 40, labcode: 'OxA-1', calibrated: true });
  assert.deepEqual(parsed(bp), {
    timestamp: { in: -1050, type: 'c', bp: true, deviation: 'P40Y' }, native: '3000 BP', labcode: 'OxA-1', calibrated: 1
  });
  assert.deepEqual(temporalToForm(bp),
    { kind: 'c', values: { meanType: 'bp', mean: 3000, devType: 'sym', dev: 40, labcode: 'OxA-1', calibrated: true } });

  const bce = formToTemporal('c', { meanType: 'bce', mean: 500, devType: 'asym', devPos: 20, devNeg: 30, comment: 'x', determination: 3 });
  assert.deepEqual(parsed(bce), {
    timestamp: { in: -500, type: 'c', bp: false, deviation_negative: 'P30Y', deviation_positive: 'P20Y' }, native: '500 BCE', comment: 'x'
  });
  assert.deepEqual(temporalToForm(bce).values,
    { comment: 'x', meanType: 'bce', mean: 500, devType: 'asym', devNeg: 30, devPos: 20, calibrated: false });
});

test('reading rules: old fuzzy date, other calendars, old plain format, text', () => {
  const old = temporalToForm('{"timestamp":{"in":"1850","deviation":"P10Y","type":"f"},"estMinDate":1840,"estMaxDate":1860.1231}');
  assert.deepEqual(old, { kind: 'r', values: { earliest: '1840', latest: '1860-12-31' } });

  const islamic = temporalToForm('{"timestamp":{"in":"2024-07-01","type":"s"},"calendar":"Islamic","native":"1445-12-24"}');
  assert.equal(islamic.readOnly, true);
  assert.equal(islamic.calendar, 'Islamic');
  assert.equal(islamic.native, '1445-12-24');
  assert.equal(temporalToForm('{"timestamp":{"in":"2024"},"calendar":"Gregorian"}').readOnly, undefined);

  assert.deepEqual(temporalToForm('|VER=1|TYP=s|DAT=1969').values, {});
  assert.ok(temporalToForm('|VER=1|TYP=s|DAT=1969').note);
  assert.deepEqual(temporalToForm('sometime in spring').values, { comment: 'sometime in spring' });
  assert.ok(temporalToForm('{bad').note);

  assert.equal(isTemporalObject('{"timestamp":{}}'), true);
  assert.equal(isTemporalObject('1969'), false);
  assert.equal(decimalToYMD(1850.07), '1850-07');
  assert.equal(decimalToYMD('-100.0401'), '-0100-04-01');
  assert.equal(decimalToYMD(1850), '1850');
});

test('checks of the four kinds', () => {
  assert.deepEqual(validateTemporal('s', { date: '1969' }), []);
  assert.equal(validateTemporal('s', {}).length, 1);
  assert.equal(validateTemporal('s', { date: 'spring' })[0].field, 'date');
  assert.equal(validateTemporal('r', { earliest: '1850' }).length, 1);
  assert.equal(validateTemporal('r', { earliest: '1860', latest: '1850' })[0].field, 'latest');
  assert.deepEqual(validateTemporal('r', { earliest: '-500', latest: '1850-05' }), []);
  assert.equal(validateTemporal('p', { tpq: '1800', pdb: '1900', taq: '1850' })[0].field, 'taq');
  assert.deepEqual(validateTemporal('p', { tpq: '1800', pdb: '1810', pde: '1840', taq: '1850' }), []);
  assert.equal(validateTemporal('c', { meanType: 'bp' })[0].field, 'mean');
});

test('range distance as PHP DateTime::diff', () => {
  assert.deepEqual(rangeApart('1850', '1860'), { years: 10, months: 0, days: 0 });
  assert.deepEqual(rangeApart('2020-01-31', '2020-03-01'), { years: 0, months: 1, days: 1 });
  assert.equal(rangeApart('1860', '1850'), null);
});

test('date fields of edit forms use the temporal input unless suppressed', () => {
  assert.equal(inputType({ type: 'date' }), 'temporal');
  assert.equal(inputType({ type: 'date', temporal: false }), 'date');
  assert.equal(inputType({ type: 'date' }, { json: false }), 'date', 'a host special editor wins');
  assert.equal(inputType({ type: 'freetext' }), 'freetext');
});
