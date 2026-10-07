const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../.fixtures');
const RUN = path.join(ROOT, process.env.VERIFY_EXECUTION || 'verification-r2');
fs.mkdirSync(RUN, {recursive:true});
const PROFILE = path.join(RUN, 'browser-profile');
const result = { checks: [], platform: 'LOCAL_FIXTURE_ONLY', rates: [] };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let chrome;
let socket;
let closeBrowser;
const server = http.createServer((req, res) => {
  const file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    const content = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const fixtureUrl = `http://127.0.0.1:${server.address().port}/fixture.html`;
  const browserPaths = [process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const browserPath = browserPaths.find(candidate => fs.existsSync(candidate));
  assert.ok(browserPath, 'Install Chrome/Edge or set CHROME_BIN to a browser executable');
  chrome = spawn(browserPath, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`,
    `--disk-cache-dir=${path.join(RUN, 'browser-cache')}`, '--window-size=850,1050', fixtureUrl
  ], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(PROFILE, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) {
    if (chrome.exitCode !== null) throw new Error('Isolated browser exited before connecting');
    await pause(100);
  }
  assert.ok(fs.existsSync(portFile), 'Browser debugging port became available');
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  let page;
  for (let i = 0; i < 100; i++) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = targets.find((target) => target.type === 'page' && target.url === fixtureUrl);
    if (page) break;
    await pause(100);
  }
  assert.ok(page, 'Fixture page became available');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    if (!payload.id) return;
    const item = pending.get(payload.id);
    if (!item) return;
    pending.delete(payload.id); clearTimeout(item.timeout);
    payload.error ? item.reject(new Error(JSON.stringify(payload.error))) : item.resolve(payload.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 12000);
    pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
    return reply.result.value;
  };
  closeBrowser = () => send('Browser.close');
  for (let i = 0; i < 100; i++) { if (await evaluate('window.fixtureReady === true')) break; await pause(100); }
  result.fixtureDiagnostics = await evaluate('({errors:window.fixtureErrors,fixture:!!window.fixture,vue:typeof Vue,pinia:typeof Pinia,elementPlus:typeof ElementPlus,html:document.body.innerText})');
  console.log(JSON.stringify(result.fixtureDiagnostics));
  assert.equal(await evaluate('window.fixtureReady'), true, 'Actual framework fixture rendered');
  result.browserVersion = await send('Browser.getVersion');
  const record = (name) => result.checks.push({ name, status: 'PASS' });
  const defaults = await evaluate(`({names:fixture.config.platformParams.cx.parts[0].params.map(p=>p.name),values:fixture.config.platformParams.cx.parts[0].params.map(p=>p.value),ai:JSON.parse(JSON.stringify(fixture.config.ai)),paidConfig:!!fixture.config.queryApis})`);
  result.defaults=defaults;console.log(JSON.stringify({defaults}));
  assert.deepEqual(defaults.values, [false, false, true, false, 1]);
  assert.equal(defaults.paidConfig, false);assert.equal(defaults.ai.voting,true);assert.equal(defaults.ai.model,'deepseek-flash');assert.equal(defaults.ai.thinking,false);
  record('Legacy non-submit settings survive; paid token removed; chapter auto-submit off; speed and AI voting migrate');
  const slider = await evaluate(`(()=>{const e=fixture.shadow.querySelector('[role="slider"]');return {min:e.getAttribute('aria-valuemin'),max:e.getAttribute('aria-valuemax'),exists:!!e};})()`);
  assert.equal(slider.min, '1'); assert.equal(slider.max, '10');
  record('Slider mounts inside a closed shadow root with range 1-10');
  const track = await evaluate(`(()=>{const e=fixture.shadow.querySelector('.el-slider__runway');const style=getComputedStyle(e);return {width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,color:style.backgroundColor};})()`);
  assert.ok(track.width > 60 && track.height >= 4, 'Slider track is visible and large enough to drag');
  assert.notEqual(track.color, 'rgba(0, 0, 0, 0)');
  record('Slider track is visibly styled in the original shadow-root arrangement');
  await evaluate(`fixture.shadow.querySelector('[role="slider"]').focus()`);
  for (const expected of [1.5, 2]) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await pause(80);
    const actual = await evaluate(`({selected:fixture.speedParam().value,rate:fixture.video.playbackRate})`);
    assert.equal(actual.selected, expected); assert.equal(actual.rate, expected);
  }
  record('Real slider keyboard interaction changes playback immediately by 0.5x');
  const dragPoint = await evaluate(`(()=>{const track=fixture.shadow.querySelector('.el-slider__runway').getBoundingClientRect();const handle=fixture.shadow.querySelector('[role="slider"]').getBoundingClientRect();return {startX:handle.left+handle.width/2,y:handle.top+handle.height/2,endX:track.left+track.width*4/9};})()`);
  await send('Input.dispatchMouseEvent', { type:'mousePressed', x:dragPoint.startX, y:dragPoint.y, button:'left', buttons:1, clickCount:1 });
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:dragPoint.endX, y:dragPoint.y, button:'left', buttons:1 });
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:dragPoint.endX, y:dragPoint.y, button:'left', buttons:0, clickCount:1 });
  await pause(120);
  assert.equal(await evaluate('fixture.speedParam().value'), 5);
  assert.equal(await evaluate('fixture.video.playbackRate'), 5);
  record('Actual mouse drag selects 5x and applies it to the video immediately');
  for (const requested of [1, 1.5, 2, 10]) {
    const rate = await evaluate(`(async()=>{fixture.speedParam().value=${requested};await Vue.nextTick();return {requested:${requested},actual:fixture.video.playbackRate,message:fixture.status.message,ui:fixture.shadow.textContent};})()`);
    result.rates.push({ requested, actual: rate.actual, message: rate.message });
    assert.equal(rate.actual, requested);
  }
  record('Native browser accepts 1x, 1.5x, 2x and 10x');
  const warningsBefore = await evaluate('fixture.logs.length');
  await evaluate(`fixture.video.dispatchEvent(new Event('loadedmetadata'));fixture.video.dispatchEvent(new Event('play'))`);
  assert.equal(await evaluate('fixture.logs.length'), warningsBefore);
  record('Repeated media events do not repeat the same unsupported-rate warning');
  await evaluate(`fixture.speedParam().value=10`); await pause(60);
  await evaluate(`fixture.video.playbackRate=1`); await pause(60);
  assert.equal(await evaluate('fixture.status.actualRate'), 10);
  assert.equal(await evaluate('fixture.status.message'), '');
  await evaluate(`fixture.video.dispatchEvent(new Event('play'))`); await pause(60);
  assert.equal(await evaluate('fixture.video.playbackRate'), 10);
  record('Regression: an external native rate reset is restored immediately without waiting for another play event');
  assert.deepEqual(await evaluate('[null,"",NaN,Infinity,-5,1.5,20,99].map(fixture.normalizeVideoSpeed)'), [1,1,1,1,1,1.5,10,10]);
  record('Empty, non-finite and out-of-range values are bounded safely');
  await evaluate(`fixture.speedParam().value=2`); await pause(60);
  const saved = await evaluate('JSON.parse(_GM_getValue("config")).platformParams.cx.parts[0].params.find(p=>p.name==="视频播放倍速").value');
  assert.equal(saved, 2);
  await send('Page.reload');
  for (let i = 0; i < 100; i++) { if (await evaluate('window.fixtureReady === true')) break; await pause(100); }
  assert.equal(await evaluate('fixture.speedParam().value'), 2);
  assert.equal(await evaluate('fixture.video.playbackRate'), 2);
  record('Saved speed reloads through the actual script configuration migration');
  const nextVideo = await evaluate(`(()=>{fixture.binding.dispose();const video=document.createElement('video');const binding=fixture.bindVideoPlaybackSpeed(video,fixture.config,(message,type)=>fixture.logs.push({message,type}));const rate=video.playbackRate;binding.dispose();video.playbackRate=1;video.dispatchEvent(new Event('play'));window.cleanupTestVideo=video;return {rate,afterDispose:video.playbackRate};})()`);
  assert.equal(nextVideo.rate, 2); assert.equal(nextVideo.afterDispose, 1);
  await evaluate(`fixture.speedParam().value=10`); await pause(60);
  assert.equal(await evaluate('window.cleanupTestVideo.playbackRate'), 1);
  record('Next video inherits speed; disposal removes the watcher and event handlers');
  const courseCap=await evaluate(`(()=>{const video=document.createElement('video');fixture.speedParam().value=2;let capCalls=0;video.addEventListener('ratechange',()=>{capCalls++;if(video.playbackRate>2)video.playbackRate=1;});const binding=fixture.bindVideoPlaybackSpeed(video,fixture.config,()=>{},{getMaximumRate:()=>2});video.dispatchEvent(new Event('ratechange'));const during={rate:video.playbackRate,capCalls};binding.dispose();video.playbackRate=3;video.dispatchEvent(new Event('ratechange'));const after={rate:video.playbackRate,capCalls};return {during,after};})()`);
  assert.equal(courseCap.during.rate,2);assert.equal(courseCap.during.capCalls,1);assert.equal(courseCap.after.rate,1);assert.equal(courseCap.after.capCalls,2);
  record('Regression: the native ratechange handler always receives events; the selected rate stays within the course cap');
  const rejection = await evaluate(`(()=>{fixture.speedParam().value=10;const video=document.createElement('video');const warnings=[];let rate=1;Object.defineProperty(video,'playbackRate',{get:()=>rate,set:value=>{if(value>4)throw new DOMException('Unsupported fixture rate','NotSupportedError');rate=value;}});const binding=fixture.bindVideoPlaybackSpeed(video,fixture.config,message=>warnings.push(message));video.dispatchEvent(new Event('play'));video.dispatchEvent(new Event('loadedmetadata'));const outcome={rate,message:fixture.status.message,warnings:warnings.length};binding.dispose();return outcome;})()`);
  assert.equal(rejection.rate, 1); assert.ok(rejection.message.includes('未接受 10')); assert.equal(rejection.warnings, 1);
  record('Simulated rejecting player retains the actual rate and shows one explicit warning');
  await evaluate(`fixture.speedParam().value=2;window.fixture.binding=fixture.bindVideoPlaybackSpeed(fixture.video,fixture.config,()=>{})`);
  await pause(80);
  await evaluate(`fixture.config.otherParams.params[0].value=0;window.choiceQ={type:'0',title:'本地选择题',optionsText:['甲','乙','丙'],searchText:{stem:'本地选择题',options:['甲','乙','丙']}}`);
  const missingKey = await evaluate(`(async()=>{const result=await aiFixture.getAnswer(choiceQ,{skipDelay:true});return {success:result.success,message:result.error.message,requests:aiFixture.network.requests.length};})()`);
  assert.equal(missingKey.success,false);assert.equal(missingKey.requests,0);assert.match(missingKey.message,/API Key/);
  record('Missing key stops before any network request');
  await evaluate(`(()=>{const input=fixture.shadow.querySelector('input[placeholder*="DeepSeek"]');input.value='sk-fixture-only';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(60);
  const keySafety=await evaluate(`({masked:fixture.shadow.querySelector('input[placeholder*="DeepSeek"]').type,managerKey:_GM_getValue('deepseek-api-key')==='sk-fixture-only',publicConfig:localStorage.getItem('config'),managerConfig:_GM_getValue('config')})`);
  assert.equal(keySafety.masked,'password');assert.equal(keySafety.managerKey,true);
  for (const serialized of [keySafety.publicConfig,keySafety.managerConfig]) {assert.ok(!serialized.includes('sk-fixture-only'));assert.ok(!serialized.includes('fixture-legacy-card'));assert.ok(!serialized.includes('queryApis'));}
  record('Actual masked key input saves to manager storage; public/legacy config no longer contains credentials');
  const vote=await evaluate(`(async()=>{aiFixture.network.responses.push(...[0,1,0].map(index=>({payload:aiFixture.completion({option_indices:[index]})})));const r=await aiFixture.getAnswer(choiceQ,{skipDelay:true});return {success:r.success,values:r.data?.items[0].answer.values,votes:r.meta?.vote_count,requests:aiFixture.network.requests.slice(-3),text:aiFixture.credentials.message};})()`);
  assert.equal(vote.success,true);assert.deepEqual(vote.values,['甲']);assert.equal(vote.votes,2);
  assert.equal(new Set(vote.requests.map(r=>r.body.messages[1].content)).size,3);
  for(const request of vote.requests){assert.equal(request.body.model,'deepseek-flash');assert.equal(request.body.thinking.type,'disabled');assert.equal(request.body.max_tokens,1024);assert.ok(!('reasoning_effort' in request.body));}
  for (const request of vote.requests) {assert.equal(request.url,'https://api.deepseek.com/chat/completions');assert.equal(request.authorizationValid,true);assert.equal(request.anonymous,true);assert.equal(request.body.response_format.type,'json_object');assert.match(request.body.messages[0].content,/JSON/);}
  assert.match(vote.text,/2\/3/);
  record('Disagreement uses three distinct prompts, only Flash without thinking, and a 1024-token output cap');
  const cached=await evaluate(`(async()=>{const n=aiFixture.network.requests.length;const r=await aiFixture.getAnswer(choiceQ,{skipDelay:true});return {success:r.success,newRequests:aiFixture.network.requests.length-n};})()`);
  assert.equal(cached.success,true);assert.equal(cached.newRequests,0);
  record('Repeated identical question reuses bounded session cache without another paid request');
  const savedVote=await evaluate(`(async()=>{aiFixture.clearCache();const n=aiFixture.network.requests.length;aiFixture.network.responses.push(...[0,0].map(index=>({payload:aiFixture.completion({option_indices:[index]})})));const r=await aiFixture.getAnswer({...choiceQ,title:'early-agreement',searchText:{stem:'early-agreement',options:choiceQ.optionsText}},{skipDelay:true});return {success:r.success,count:aiFixture.network.requests.length-n,routes:r.meta.actual_routes,votes:r.meta.vote_count};})()`);
  assert.equal(savedVote.success,true);assert.equal(savedVote.count,2);assert.equal(savedVote.routes,2);assert.equal(savedVote.votes,2);
  record('Two agreeing Flash answers establish the majority and skip the third paid call');
  assert.equal(await evaluate('fixture.config.ai.allowGuess'),true);
  const tie=await evaluate(`(async()=>{fixture.config.ai.allowGuess=false;aiFixture.clearCache();aiFixture.network.responses.push(...[0,1,2].map(index=>({payload:aiFixture.completion({option_indices:[index]})})));const r=await aiFixture.getAnswer(choiceQ,{skipDelay:true});return {success:r.success,message:r.error.message};})()`);
  assert.equal(tie.success,false);assert.match(tie.message,/未形成多数/);
  record('Three different answers produce no automatic choice');
  const multi=await evaluate(`(()=>{const q={...choiceQ,type:'1'};const rs=[[0,2],[2,0],[1]].map(indices=>aiFixture.parseAiCompletion(aiFixture.completion({option_indices:indices}),q));const r=aiFixture.chooseMajorityAnswer(rs);return {success:r.success,votes:r.meta.vote_count,values:r.data.items[0].answer.values};})()`);
  assert.equal(multi.success,true);assert.equal(multi.votes,2);assert.deepEqual(multi.values,['甲','丙']);
  record('Multiple-choice vote compares the complete option set independently of order');
  const invalid=await evaluate(`(()=>{const cases=[{option_indices:[9]},{option_indices:[0,0]},{option_indices:[0,1]},{option_indices:['A']},{option_indices:[0],uncertain:true}];const results=cases.map(a=>aiFixture.parseAiCompletion(aiFixture.completion(a),choiceQ).success);const empty=aiFixture.parseAiCompletion({choices:[{finish_reason:'stop',message:{content:''}}]},choiceQ).success;const truncated=aiFixture.parseAiCompletion({choices:[{finish_reason:'length',message:{content:'{}'}}]},choiceQ).success;return [...results,empty,truncated];})()`);
  assert.deepEqual(invalid,[false,false,false,false,false,false,false]);
  record('Out-of-range/duplicate/string indices, uncertain/empty/truncated responses are rejected');
  const failedRoutes=await evaluate(`(()=>{const valid=aiFixture.parseAiCompletion(aiFixture.completion({option_indices:[0]}),choiceQ);const failure={success:false,error:{message:'mock failure'}};return [aiFixture.chooseMajorityAnswer([valid,failure,failure]).success,aiFixture.chooseMajorityAnswer([valid,valid,failure]).meta.vote_count];})()`);
  assert.deepEqual(failedRoutes,[false,2]);
  record('One usable route cannot win; two equal usable routes can win despite one failure');
  const guessToggle=await evaluate(`(()=>{const label=Array.from(fixture.shadow.querySelectorAll('label')).find(e=>e.textContent.includes('无多数时采用最可能答案'));label.querySelector('input').click();return fixture.config.ai.allowGuess;})()`);
  assert.equal(guessToggle,true);
  record('Actual guess checkbox changes the persisted preference; migrated config enables the user-requested fallback');
  const guessedTie=await evaluate(`(async()=>{aiFixture.clearCache();const n=aiFixture.network.requests.length;aiFixture.network.responses.push(...[0,1,2].map(index=>({payload:aiFixture.completion({option_indices:[index]})})));const r=await aiFixture.getAnswer(choiceQ,{skipDelay:true});const q={...choiceQ};aiFixture.getAnswerValues(r,q);return {success:r.success,values:r.data.items[0].answer.values,guessed:r.meta.guessed,route:r.meta.selected_route,votes:r.meta.vote_count,calls:aiFixture.network.requests.length-n,explanation:q.answerExplanation};})()`);
  assert.equal(guessedTie.success,true);assert.deepEqual(guessedTie.values,['甲']);assert.equal(guessedTie.guessed,true);assert.equal(guessedTie.route,1);assert.equal(guessedTie.votes,1);assert.equal(guessedTie.calls,3);assert.match(guessedTie.explanation,/推测答案.*未形成多数/);
  record('Three-way disagreement selects the earliest highest-vote result and clearly marks it as a guess without a fourth call');
  const savedGuess=await evaluate(`(async()=>{aiVoteCache.clear();const n=aiFixture.network.requests.length;const r=await aiFixture.getAnswer(choiceQ,{skipDelay:true});return {success:r.success,guessed:r.meta.guessed,calls:aiFixture.network.requests.length-n};})()`);
  assert.deepEqual(savedGuess,{success:true,guessed:true,calls:0});
  record('Guessed answers survive refresh with their uncertainty label and avoid repeated paid requests');
  const disabledGuess=await evaluate(`(async()=>{fixture.config.ai.allowGuess=false;const n=aiFixture.network.requests.length;aiFixture.network.responses.push(...[0,1,2].map(index=>({payload:aiFixture.completion({option_indices:[index]})})));const r=await aiFixture.getAnswer(choiceQ,{skipDelay:true});fixture.config.ai.allowGuess=true;return {success:r.success,calls:aiFixture.network.requests.length-n};})()`);
  assert.deepEqual(disabledGuess,{success:false,calls:3});
  record('Disabling guesses refuses a cached guessed answer and restores the two-vote requirement');
  const blankGuess=await evaluate(`(()=>{const q={type:'2',title:'单空填空',element:Object.assign(document.createElement('div'),{innerHTML:'<textarea></textarea>'})};const valid=aiFixture.parseAiCompletion(aiFixture.completion({answers:['劳动者']}),q);const cancelled={success:false,error:{message:'AI 请求已停止或取消'}};const uncertain=aiFixture.parseAiCompletion(aiFixture.completion({uncertain:true}),q);const result=aiFixture.chooseMajorityAnswer([valid,cancelled,uncertain],{allowGuess:true});return {success:result.success,values:result.data.items[0].answer.values,guessed:result.meta.guessed,route:result.meta.selected_route,allFailed:aiFixture.chooseMajorityAnswer([cancelled,uncertain,cancelled],{allowGuess:true}).success};})()`);
  assert.deepEqual(blankGuess,{success:true,values:['劳动者'],guessed:true,route:1,allFailed:false});
  record('Regression: a usable blank answer can be selected despite a cancelled and uncertain route; entirely invalid responses still cannot fill');
  for (const status of [401,402,429,500,503]) {
    const httpError=await evaluate(`(async()=>{fixture.config.ai.enabled=true;aiFixture.network.responses.push({status:${status},raw:'private-server-detail'});const r=await aiFixture.getAnswer(choiceQ,{skipDelay:true,skipVoting:true,useCache:false});const result={success:r.success,code:r.error.code,message:r.error.message};fixture.config.ai.enabled=true;return result;})()`);
    assert.equal(httpError.success,false);assert.equal(httpError.code,'HTTP_'+status);assert.ok(!httpError.message.includes('private-server-detail'));
  }
  record('Authentication, balance, rate-limit and server errors have clear messages without raw response leakage');
  const early=await evaluate(`(async()=>{aiFixture.clearCache();const n=aiFixture.network.requests.length;aiFixture.network.responses.push({status:401,raw:'{}'});const r=await aiFixture.getAnswer(choiceQ,{skipDelay:true});return {success:r.success,count:aiFixture.network.requests.length-n};})()`);
  assert.equal(early.success,false);assert.equal(early.count,1);
  record('Invalid key stops voting after the first request');
  const paused=await evaluate(`(async()=>{const n=aiFixture.network.requests.length;const r=await aiFixture.getAnswer({...choiceQ,title:'another question after auth error'},{skipDelay:true,useCache:false});const result={enabled:fixture.config.ai.enabled,count:aiFixture.network.requests.length-n,success:r.success};fixture.config.ai.enabled=true;return result;})()`);
  assert.deepEqual(paused,{enabled:false,count:0,success:false});
  record('Authentication, balance and rate-limit failures pause AI before another question can issue requests');
  const badNetwork=await evaluate(`(async()=>{const outcomes=[];for(const mock of [{raw:'not-json'},{timeout:true},{networkError:true},{payload:aiFixture.completion({option_indices:[0]}),finalUrl:'https://invalid.example/'}]){aiFixture.network.responses.push(mock);outcomes.push((await aiFixture.getAnswer(choiceQ,{skipDelay:true,skipVoting:true,useCache:false})).success);}return outcomes;})()`);
  assert.deepEqual(badNetwork,[false,false,false,false]);
  record('Malformed JSON, timeout, network failure and redirected response fail without filling');
  const cancelled=await evaluate(`(async()=>{aiFixture.network.responses.push({hold:true});const controller=new AbortController();const before=aiFixture.network.aborts;const work=aiFixture.getAnswer(choiceQ,{skipDelay:true,useCache:false,signal:controller.signal});controller.abort();const r=await work;return {success:r.success,aborts:aiFixture.network.aborts-before};})()`);
  assert.equal(cancelled.success,false);assert.equal(cancelled.aborts,1);
  record('Abort signal cancels a pending request and stops subsequent voting routes');
  const stopped=await evaluate(`(async()=>{aiFixture.network.responses.push({hold:true});const n=aiFixture.network.requests.length;const work=aiFixture.getAnswer(choiceQ,{skipDelay:true,useCache:false});aiFixture.stop();const r=await work;const outcome={success:r.success,enabled:fixture.config.ai.enabled,count:aiFixture.network.requests.length-n};fixture.config.ai.enabled=true;return outcome;})()`);
  assert.equal(stopped.success,false);assert.equal(stopped.enabled,false);assert.equal(stopped.count,1);
  record('Stop button disables AI, aborts in-flight work, and prevents remaining routes');
  await evaluate(`window.makeChoiceQuestion=(type='0')=>{const root=document.createElement('div');root.style.display='none';const texts=['甲','乙','丙'];const name='q-'+Math.random();const options={};texts.forEach((text,index)=>{const label=document.createElement('label');const input=document.createElement('input');input.type=type==='1'?'checkbox':'radio';input.name=name;label.append(input,document.createTextNode(text));root.append(label);options[text]=label;});document.body.append(root);return {element:root,type,title:'页面填写测试',optionsText:texts,options,searchText:{stem:'页面填写测试',options:texts},answer:['甲'],answerOptionIndices:[0]};};window.fillHandler={_window:window,type:'zj'};void 0;`);
  const filled=await evaluate(`(async()=>{const single=makeChoiceQuestion();single.options['乙'].querySelector('input').checked=true;const ok=await aiFixture.fill(fillHandler,single);const singleChecked=Array.from(single.element.querySelectorAll('input')).map(e=>e.checked);const multiple=makeChoiceQuestion('1');multiple.answer=['甲','丙'];multiple.answerOptionIndices=[0,2];multiple.options['乙'].querySelector('input').checked=true;const multiOk=await aiFixture.fill(fillHandler,multiple);const multiChecked=Array.from(multiple.element.querySelectorAll('input')).map(e=>e.checked);single.element.remove();multiple.element.remove();return {ok,singleChecked,multiOk,multiChecked};})()`);
  assert.equal(filled.ok,true);assert.deepEqual(filled.singleChecked,[true,false,false]);assert.equal(filled.multiOk,true);assert.deepEqual(filled.multiChecked,[true,false,true]);
  record('Actual native single/multiple inputs are filled by index; unwanted checked options are cleared');
  const refusal=await evaluate(`(async()=>{const q=makeChoiceQuestion();q.answerOptionIndices=[9];const invalid=await aiFixture.fill(fillHandler,q);q.answerOptionIndices=[0];q.options['甲'].querySelector('input').disabled=true;const disabled=await aiFixture.fill(fillHandler,q);q.element.remove();const detached=await aiFixture.fill(fillHandler,q);return [invalid,disabled,detached];})()`);
  assert.deepEqual(refusal,[false,false,false]);
  record('Invalid, disabled and detached option targets cannot report a successful fill');
  const textFill=await evaluate(`(async()=>{const element=document.createElement('div');element.style.display='none';element.innerHTML='<textarea></textarea><textarea></textarea>';document.body.append(element);let changes=0;element.addEventListener('input',()=>changes++);const q={element,type:'2',answer:['第一空','第二空']};const ok=await aiFixture.fill(fillHandler,q);const values=Array.from(element.querySelectorAll('textarea')).map(e=>e.value);q.answer=['只有一空'];const mismatch=await aiFixture.fill(fillHandler,q);element.remove();return {ok,values,changes,mismatch};})()`);
  assert.equal(textFill.ok,true);assert.deepEqual(textFill.values,['第一空','第二空']);assert.equal(textFill.changes,2);assert.equal(textFill.mismatch,false);
  record('Blank answers fill each field and dispatch input events; mismatched blank counts are refused');
  const countRegression=await evaluate(`(async()=>{aiFixture.clearCache();const q=makeChoiceQuestion();q.title='无法选中的页面';q.searchText.stem=q.title;Object.values(q.options).forEach(e=>e.click=()=>{});const h=new aiFixture.CxQuestionHandler('zj');h.parseHtml=()=>{h.questions=[q];};aiFixture.network.responses.push(...[0,0].map(index=>({payload:aiFixture.completion({option_indices:[index]})})));const rate=await h.init();const row=useQuestionStore().questionList.at(-1);const result={rate,status:row.fillStatus};q.element.remove();return result;})()`);
  assert.equal(countRegression.rate,0);assert.equal(countRegression.status,'failed');
  record('Regression: an AI answer that fails to select the page is counted as zero filled, rather than correct');
  const renderSafety=await evaluate(`(async()=>{aiFixture.questions.push({title:'<img src="bad" onerror="window.badHtml=1">',searchText:{stem:'显示题目'},answer:['<img src="bad" onerror="window.badHtml=1">'],answerStatus:'success',answerExplanation:'2/3 一致'});await Vue.nextTick();return {images:fixture.shadow.querySelectorAll('.answer-result img').length,text:fixture.shadow.querySelector('.answer-result').textContent,badHtml:window.badHtml||0};})()`);
  assert.equal(renderSafety.images,0);assert.match(renderSafety.text,/<img/);assert.equal(renderSafety.badHtml,0);
  record('AI output renders as plain text, preventing injected HTML execution');
  await evaluate(`aiFixture.questions.splice(0);aiFixture.network.responses.push({payload:aiFixture.completion({judgement:true})})`);
  await evaluate(`(()=>{const button=Array.from(fixture.shadow.querySelectorAll('button')).find(e=>e.textContent.includes('测试连接'));button.click();})()`);
  for(let i=0;i<30;i++){if(await evaluate('!aiFixture.credentials.testing'))break;await pause(50);}
  assert.match(await evaluate('aiFixture.credentials.message'),/连接成功/);
  record('Actual connection-test button receives and validates a mocked structured API response');
  assert.equal(await evaluate('aiFixture.network.requests.at(-1).body.max_tokens'),512);
  assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
  record('No browser errors or unhandled promise rejections during integration tests');

  await require('./flow-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./playback-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./completion-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./reload-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./resume-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./source-readiness-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./log-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./foreground-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./continuous-playback-checks.cjs')({evaluate,pause,record,assert,result});
  await require('./speed-policy-checks.cjs')({evaluate,pause,record,assert,result});
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(RUN, 'deepseek-preview.png'), Buffer.from(screenshot.data, 'base64'));
  result.status = 'PASS';
  fs.writeFileSync(path.join(RUN, 'browser-report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: result.checks.length, browser: result.browserVersion.product, rates: result.rates }, null, 2));
  await send('Browser.close');
})().catch(async (error) => {
  result.status = 'FAIL'; result.error = error.stack;
  fs.writeFileSync(path.join(RUN, 'browser-report.json'), JSON.stringify(result, null, 2));
  console.error(error.stack); process.exitCode = 1;
  if (closeBrowser) await closeBrowser().catch(() => {});
}).finally(() => {
  if (socket) socket.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  server.close();
});



