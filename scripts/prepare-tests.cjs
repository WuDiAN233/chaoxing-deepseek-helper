const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixtures = path.join(root, '.fixtures');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

(async () => {
  fs.mkdirSync(path.join(fixtures, 'dependencies'), {recursive:true});
  for (const asset of JSON.parse(fs.readFileSync(path.join(root, 'tests/dependency-manifest.json'), 'utf8'))) {
    const destination = path.join(fixtures, 'dependencies', asset.name);
    if (fs.existsSync(destination) && digest(fs.readFileSync(destination)) === asset.sha256) continue;
    const response = await fetch(asset.url, {signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`Dependency download failed: ${asset.name} (HTTP ${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== asset.sha256) throw new Error(`Dependency checksum differs: ${asset.name}`);
    fs.writeFileSync(destination, bytes);
  }
  const source = fs.readFileSync(path.join(root, 'chaoxing-deepseek-helper.user.js'), 'utf8');
  const version = source.match(/^\/\/ @version\s+(\S+)/m)?.[1];
  if (!version) throw new Error('Missing userscript version');
  const template = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixture-template.json'), 'utf8'));
  let code = `const fixtureScriptVersion=${JSON.stringify(version)};\n` + template.prefix;
  for (const [start, end] of template.sections) {
    const begin = source.indexOf(start);
    const finish = source.indexOf(end, begin);
    if (begin < 0 || finish < begin) throw new Error(`Fixture extraction boundary missing: ${start}`);
    code += source.slice(begin, finish);
  }
  code += template.suffix;
  fs.writeFileSync(path.join(fixtures, 'fixture-code.js'), code);
  fs.writeFileSync(path.join(fixtures, 'fixture.html'), template.html);
  console.log('Built actual-component fixture; AI requests are local mocks.');
})().catch(error => { console.error(error.message); process.exitCode=1; });
