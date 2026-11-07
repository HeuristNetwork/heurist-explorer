/**
 * @file temporalLocale.js
 * @brief Words and patterns of the human-readable date text, by language.
 *
 * Kept here and not in the localization files: a report or a website page can ask for a language
 * other than the interface language, and the server writes the same text. Keep in step with
 * `Heurist\Utilities\TemporalLocale`; the cases in `shared/test/fixtures/temporal-locale` run on both.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Other codes of a language in the table. */
const ALIASES = Object.freeze({ fra: 'fre' });

/** Date words by language (3 letters). `firstDay`: the text of day 1 when it differs from the number. */
const WORDS = Object.freeze({
  eng: Object.freeze({
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December'],
    firstDay: null,
    dayMonthYear: '{d} {m} {y}',
    monthYear: '{m} {y}',
    range: '{from} to {to}',
    circa: 'circa',
    before: 'before',
    after: 'after',
    bce: 'BCE',
    bya: 'bya',
    mya: 'Mya',
    year: 'year',
    years: 'years',
    month: 'month',
    monthPlural: 'months',
    day: 'day',
    days: 'days',
    gregorian: 'Gregorian'
  }),
  fre: Object.freeze({
    months: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    monthsLong: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
      'septembre', 'octobre', 'novembre', 'décembre'],
    firstDay: '1er',
    dayMonthYear: '{d} {m} {y}',
    monthYear: '{m} {y}',
    range: '{from} à {to}',
    circa: 'vers',
    before: 'avant',
    after: 'après',
    bce: 'av. J.-C.',
    bya: 'Ga',
    mya: 'Ma',
    year: 'an',
    years: 'ans',
    month: 'mois',
    monthPlural: 'mois',
    day: 'jour',
    days: 'jours',
    gregorian: 'grégorien'
  })
});

/**
 * The date words of a language.
 *
 * @param {string} [language] Language code (3 letters, any case).
 * @returns {object} Words of the language; English for a language that has none.
 */
export function temporalWords(language) {
  const code = String(language ?? '').trim().toLowerCase();
  return WORDS[ALIASES[code] || code] || WORDS.eng;
}
