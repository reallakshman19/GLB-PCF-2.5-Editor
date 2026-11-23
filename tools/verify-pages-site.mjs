/**
 * Gate the GitHub Pages payload, rather than accidentally publishing this
 * repository's large CAD / GLB test fixtures or local development tools.
 * Run after staging the static website into _site.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const site = path.resolve(process.argv[2] || '_site');

function assertFile(relativePath) {
  const resolved = path.resolve(site, relativePath);
  assert.ok(
    resolved.startsWith(site + path.sep),
    `Page reference escapes the site root: ${relativePath}`,
  );
  assert.ok(existsSync(resolved), `Missing published asset: ${relativePath}`);
  assert.ok(statSync(resolved).isFile(), `Not a published file: ${relativePath}`);
}

for (const file of [
  'index.html',
  '.nojekyll',
  'core/app.js',
  'css/app.css',
  'vendor/pipe-component-data/src/index.js',
  'capabilities-status.json',
]) assertFile(file);

const html = readFileSync(path.join(site, 'index.html'), 'utf8');
assert.match(html, /<script\s+type="module"\s+src="core\/app\.js"/);
assert.match(html, /<script\s+type="importmap">/);

const mapMatch = html.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/);
assert.ok(mapMatch, 'Missing embedded import map');
const importMap = JSON.parse(mapMatch[1]);
for (const target of Object.values(importMap.imports || {})) {
  if (typeof target === 'string' && target.startsWith('./')) {
    assertFile(target.slice(2));
  }
}

// Root-relative paths would break when hosted under /GLB-PCF-2.5-Editor/.
for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
  const ref = match[1];
  if (/^(?:https?:|data:|#|mailto:|javascript:|\/\/)/i.test(ref)) continue;
  assert.ok(!ref.startsWith('/'), `Root-relative asset URL: ${ref}`);
  assertFile(ref.split(/[?#]/)[0].replace(/^\.\//, ''));
}

const excluded = ['test', 'tests', 'Comments', 'benchmarks', '.github', 'node_modules',
  'package.json', 'package-lock.json', 'tools', 'reports', 'docs', 'qa-report-2026-05-01.md'];
for (const name of excluded) {
  assert.ok(!existsSync(path.join(site, name)), `Non-runtime content published: ${name}`);
}

function treeBytes(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((total, item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return total + treeBytes(full);
    return total + (item.isFile() ? statSync(full).size : 0);
  }, 0);
}
const bytes = treeBytes(site);
assert.ok(bytes < 25 * 1024 * 1024, `Unexpectedly large Pages payload: ${bytes} bytes`);
console.log(`GitHub Pages site OK: ${bytes} bytes, correct assets, fixtures excluded.`);
