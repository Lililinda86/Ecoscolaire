import fs from 'node:fs/promises';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';

// Render the actual component, using synthetic content only. No application login/network.
const root = process.cwd();
const filename = path.join(root, 'src/features/pedagogy/components/AssessmentPrint.tsx');
const source = (await fs.readFile(filename, 'utf8')).replace("import '../pedagogy-print.css';", '');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const componentModule = new Module(filename);
componentModule.filename = filename;
componentModule.paths = createRequire(filename).resolve.paths('react');
componentModule._compile(compiled, filename);
const { AssessmentPrint } = componentModule.exports;
const css = (await Promise.all(['pedagogy.css', 'pedagogy-print.css'].map(name => fs.readFile(path.join(root, 'src/features/pedagogy', name), 'utf8')))).join('\n');
const output = path.join(root, 'output/pdf/pedagogy-synthetic');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const language of ['fr', 'en']) for (const mode of ['student', 'correction']) {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    const items = Array.from({ length: 24 }, (_, index) => ({ id: `synthetic-${index}`, order: index + 1, points: 1,
      questionText: `${language === 'fr' ? 'Question synthétique' : 'Synthetic question'} ${index + 1} : 2 + 3 = ?`,
      instructions: language === 'fr' ? 'Explique ta démarche en une phrase.' : 'Explain your reasoning in one sentence.',
      expectedAnswer: '5', correctionGuide: language === 'fr' ? 'Accepter toute démarche correcte. Ne pas inférer une compétence globale.' : 'Accept any correct method. Do not infer overall competency.' }));
    const markup = renderToStaticMarkup(React.createElement(AssessmentPrint, {
      school: { name: 'SYNTHETIC SCHOOL - PRINT QA', address: 'Synthetic address' }, language, mode, sourceChanged: false,
      academicYearLabel: '2026-2027', items,
      assessment: { status: 'draft', className: 'SYNTHETIC CLASS', fridayDate: '2026-09-11', weekStartDate: '2026-09-07', durationMinutes: 45, totalPoints: 24, generationVersion: 2, contentRevision: 3, instructions: 'SYNTHETIC FIXTURE - NOT A PEDAGOGICAL APPROVAL' },
    }));
    await page.setContent(`<html><head><meta charset="utf-8"><style>body{margin:0} ${css}</style></head><body><aside>NON_DOCUMENT_SENTINEL</aside><main>${markup}</main></body></html>`);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${language}/${mode}: overflow at ${width}`);
    }
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('aside').isVisible(), false);
    assert.equal(await page.locator('.assessment-question').count(), 24);
    assert.equal(await page.locator('.assessment-watermark').isVisible(), true);
    const pdfPath = path.join(output, `${language}-${mode}.pdf`);
    await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
    if (process.env.PEDAGOGY_PDFTOTEXT) {
      const text = execFileSync(process.env.PEDAGOGY_PDFTOTEXT, ['-layout', pdfPath, '-'], { encoding: 'utf8' });
      const pages = text.split('\f').filter(value => value.trim());
      assert.ok(pages.length > 1, 'Multipage fixture must exercise pagination');
      pages.forEach((content, index) => assert.ok(content.includes(`Page ${index + 1} / ${pages.length}`), 'Actual page counter missing'));
      assert.ok(!text.includes('NON_DOCUMENT_SENTINEL'));
      assert.ok(text.includes('24.'));
      assert.ok(text.includes('Version 2.3'));
      console.log(`PDF extraction: ${pages.length} numbered pages PASS`);
    }
    await page.close();
    console.log(`Rendered ${language}-${mode}; 24 questions; responsive widths and draft warning PASS`);
  }
} finally { await browser.close(); }
