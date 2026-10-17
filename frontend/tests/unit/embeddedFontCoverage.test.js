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

test('fontStyleForText décode l entité avant de juger la couverture', () => {
  const style = {
    font_family: "'PDFEmbed-Times', sans-serif",
    bold: true,
  };
  const fonts = [{
    family: 'PDFEmbed-Times',
    weight: 700,
    style: 'normal',
    coverage: ' ACTIVITIES&INTERST',
  }];
  const out = fontStyleForText(style, 'ACTIVITIES &amp; INTERESTS', fonts);
  assert.equal(out.font_family, style.font_family);
});

test('fontStyleForText retire la police si la graisse du texte n a pas de face', () => {
  const style = {
    font_family: "'PDFEmbed-Times', sans-serif",
  };
  const fonts = [{
    family: 'PDFEmbed-Times',
    weight: 700,
    style: 'normal',
    coverage: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  }];
  const out = fontStyleForText(style, 'Banking', fonts);
  assert.equal(out.font_family, undefined);
});

test('fontStyleForText garde la famille si chaque graisse couvre son passage', () => {
  const style = {
    font_family: "'PDFEmbed-Times', sans-serif",
  };
  const fonts = [
    {
      family: 'PDFEmbed-Times',
      weight: 400,
      style: 'normal',
      coverage: ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.',
    },
    {
      family: 'PDFEmbed-Times',
      weight: 700,
      style: 'normal',
      coverage: ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    },
  ];
  const out = fontStyleForText(
    style,
    '<strong>Head</strong><br>Job Simulation',
    fonts,
  );
  assert.equal(out.font_family, style.font_family);
});

test('fontStyleForText incline le romain si l italique du PDF n a pas les lettres', () => {
  const style = {
    font_family: "'PDFEmbed-Times', sans-serif",
    italic: true,
  };
  const fonts = [
    {
      family: 'PDFEmbed-Times',
      weight: 400,
      style: 'normal',
      coverage: ' GlobalEmployerBrand',
    },
    {
      family: 'PDFEmbed-Times',
      weight: 400,
      style: 'italic',
      coverage: ' Global',
    },
  ];
  const out = fontStyleForText(style, 'Global Employer', fonts);
  assert.equal(out.font_family, "'PDFEmbed-Times__up', sans-serif");
  assert.equal(out.italic, true);
});

test('fontStyleForText ignore une puce absente de la police du texte', () => {
  const style = {
    font_family: "'PDFEmbed-Times', sans-serif",
  };
  const fonts = [{
    family: 'PDFEmbed-Times',
    weight: 400,
    style: 'normal',
    coverage: ' Analyzed',
  }];
  const out = fontStyleForText(style, '• Analyzed', fonts);
  assert.equal(out.font_family, style.font_family);
});
