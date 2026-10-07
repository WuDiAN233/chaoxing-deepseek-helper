const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git','.fixtures','.artifacts','node_modules','__pycache__']);
const files=[];
const walk = directory => {
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    if (ignored.has(entry.name)) continue;
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()) walk(file); else files.push(file);
  }
};
walk(root);
const secretPatterns=[/sk-[A-Za-z0-9_-]{24,}/g,/github_pat_[A-Za-z0-9_]{30,}/g,/gh[pousr]_[A-Za-z0-9]{30,}/g,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g];
let failed=false;
for(const file of files){
  const relative=path.relative(root,file).replaceAll(path.sep,'/');
  if(/(?:^|\/)\.env(?:\.|$)|\.(?:db|sqlite\w*|har|zip)$|browser-profile|localStorage|^runtime\//i.test(relative)){
    console.error(`Private or generated file in public tree: ${relative}`);failed=true;continue;
  }
  const text=fs.readFileSync(file,'utf8');
  if(secretPatterns.some(pattern=>{pattern.lastIndex=0;return pattern.test(text);})){console.error(`Credential-like content in ${relative}; values withheld`);failed=true;}
  if(/\.(?:js|cjs)$/.test(file)){
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    if(result.status!==0){console.error(`Syntax check failed: ${relative}`);failed=true;}
  }
}
const source=fs.readFileSync(path.join(root,'chaoxing-deepseek-helper.user.js'),'utf8');
const version=source.match(/^\/\/ @version\s+(\S+)/m)?.[1];
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(version!==pkg.version){console.error('Package/userscript versions differ');failed=true;}
if(/search\.tikuhai\.com|api\.tikuhai\.com|62\.234\.36\.191/.test(source)){console.error('Legacy paid endpoint present');failed=true;}
const hosts=[...source.matchAll(/^\/\/ @connect\s+(\S+)/gm)].map(match=>match[1]);
if(hosts.length!==1||hosts[0]!=='api.deepseek.com'){console.error('Unexpected AI request host');failed=true;}
if(failed)process.exitCode=1;else console.log(`PASS: syntax, metadata, restricted AI host and credential scan (${files.length} public files).`);
