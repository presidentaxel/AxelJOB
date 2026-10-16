import assert from 'node:assert/strict';
import test from 'node:test';
import { fontStyleForText } from '../../src/lib/embeddedFontCoverage.js';

const LEAGUE = [{
  family: 'PDFEmbed-LeagueSpartan',
  weight: 700,
  style: 'normal',
  coverage: ' ABCINU',
}];

test('fontStyleForText retire la police si une lettre manque', () => {
  const style = {
    font_family: "'PDFEmbed-LeagueSpartan', sans-serif",
    bold: true,
    font_size: 17,
  };
  const out = fontStyleForText(style, 'Bianca Banu', LEAGUE);
  assert.equal(out.font_family, undefined);
  assert.equal(out.bold, true);
  assert.equal(out.font_size, 17);
});

test('fontStyleForText garde la police quand toutes les lettres existent', () => {
  const style = {
    font_family: "'PDFEmbed-LeagueSpartan', sans-serif",
    bold: true,
  };
  const out = fontStyleForText(style, 'BIANCA BANU', LEAGUE);
  assert.equal(out.font_family, style.font_family);
});
