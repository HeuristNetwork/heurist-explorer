/**
 * @file smartyPatterns.js
 * @brief Ready-made Smarty fragments of the report editor's "Insert pattern" menu.
 *
 * Port of the legacy report editor's `_insertPattern` (same texts; "Add record
 * link" is left out: it needs the legacy new-record dialog).
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

/** Patterns: `{id, label, text}`; labels are resource keys. */
export const SMARTY_PATTERNS = Object.freeze([
  {
    id: 'records-loop',
    label: 'Records loop',
    text: '\n\n{*------------------------------------------------------------*} \n'
      + '{foreach $results as $r} {* Start records loop, do not remove *} \n'
      + '{$r = $heurist->getRecord($r)}\n'
      + '{*------------------------------------------------------------*} \n'
      + ' \n\n'
      + '  {* put the data you want output for each record here - insert the *} \n'
      + '  {* fields using the tree of record types and fields on the right *} \n'
      + ' \n'
      + '<br> {* line break between each record *} \n'
      + ' \n'
      + '{*------------------------------------------------------------*} \n'
      + '{/foreach} {* end records loop, do not remove *} \n'
      + '{*------------------------------------------------------------*} '
      + '\n\n'
  },
  {
    id: 'section-heading',
    label: 'Heading for record type',
    text: '{* Section heading *} \n'
      + '\n{* Make sure your search results are sorted by record type. \n'
      + '   Move the following instruction near the top of the file: {$lastRecordType = 0}\n'
      + '   Modify the sorting variable and the test according to your needs.*} \n\n'
      + '{if $lastRecordType != $r.recTypeID} {$lastRecordType = $r.recTypeID}\n'
      + '      <hr> \n'
      + '      <p/> \n'
      + '      <h1>{$r.recTypeName}</h1> {* Replace this with whatever you want as a heading *} \n'
      + '{/if} {* end of section heading *} '
      + '\n\n'
  },
  {
    id: 'simple-table',
    label: 'Simple table',
    text: '\n\n{* Put narrow specified-width columns at the start and any long text columns at the end *} \n'
      + '<table style="text-align:left;margin-left:20px;margin-top:2px;" border="0" cellpadding="2"> \n'
      + '   <tr> \n'
      + '      <td style="width: 50px"> {$r.recID}    </td> \n'
      + '      <td style="width:400px"> {$r.recTitle} </td> \n'
      + '      <td style=" "> </td> \n'
      + '      <td style=" "> </td> \n'
      + '      <td style=" "> </td> \n'
      + '   </tr> \n'
      + '</table>'
      + '\n\n'
  },
  {
    id: 'loop-first',
    label: 'Before the first value of a loop',
    text: '\n\n{* Information before first element of a loop (nothing output if loop is empty). \n'
      + '   Place this before the fields output in the loop. Replace \'valueloop\' with the name of the loop. *}\n\n'
      + '{if $smarty.foreach.valueloop.first}\n'
      + ' \n'
      + ' {* Add the information you want output before the first iteration here *}\n'
      + ' \n'
      + '{/if}'
      + '\n\n'
  },
  {
    id: 'loop-last',
    label: 'After the last value of a loop',
    text: '\n\n{* Information after last element of a loop (nothing output if loop is empty). \n'
      + '   Place this after the fields output in the loop. Replace \'valueloop\' with the name of the loop. *}\n'
      + '{if $smarty.foreach.valueloop.last}\n'
      + ' \n'
      + ' {* Add the information you want output after the last iteration here *}\n'
      + ' \n'
      + '{/if}'
      + '\n\n'
  },
  {
    id: 'spacing-div',
    label: 'Block with spacing',
    text: '\n\n{* You can use style= on divs, spans, table rows and cells etc. to control spacing *} \n'
      + '<div style="padding-top:5px; margin-left:10px;"> \n'
      + '   {* Put content here *} \n'
      + '</div>'
      + '\n\n'
  },
  {
    id: 'related-records',
    label: 'Related records',
    text: '\n{* Records related to $r by relationships *}\n'
      + '{$related = $heurist->getRelatedRecords($r)}\n'
      + '{foreach $related as $rel name=relloop}\n'
      + '    {$rel.recRelationType}: {$rel.recTitle}<br>\n'
      + '{/foreach}\n'
  }
]);
