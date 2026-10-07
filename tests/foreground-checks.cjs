module.exports = async ({evaluate, record, assert}) => {
  await evaluate(`window.makeForegroundVideo=()=>{const state={paused:true,ended:false,calls:0};const video=new EventTarget();Object.defineProperties(video,{paused:{get:()=>state.paused},ended:{get:()=>state.ended},readyState:{get:()=>4}});video.play=async()=>{state.calls++;state.paused=false;};return {video,state};}`);
  const background = await evaluate(`(async()=>{
    const {video,state}=makeForegroundVideo();let allowed=false,failures=0;
    video.play=async()=>{state.calls++;state.paused=!allowed;if(!allowed)video.dispatchEvent(new Event('pause'));};
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:new AbortController().signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isPlaybackAllowed:()=>allowed,isFinished:()=>false,onFinished:()=>{},onFailure:()=>failures++,log:()=>{},delayMs:1,pollMs:5});
    await new Promise(r=>setTimeout(r,65));const waiting={calls:state.calls,failures};
    allowed=true;await new Promise(r=>setTimeout(r,40));guard.dispose();
    return {waiting,calls:state.calls,paused:state.paused,failures};
  })()`);
  assert.deepEqual(background.waiting,{calls:0,failures:0});
  assert.equal(background.calls,1);assert.equal(background.paused,false);assert.equal(background.failures,0);
  record('A course that forbids background playback waits without consuming recovery attempts, then resumes when foreground playback is allowed');

  const queued = await evaluate(`(async()=>{
    const {video,state}=makeForegroundVideo();let allowed=true;
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:new AbortController().signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isPlaybackAllowed:()=>allowed,isFinished:()=>false,onFinished:()=>{},onFailure:()=>{},log:()=>{},delayMs:30,pollMs:5});
    guard.resume();setTimeout(()=>allowed=false,5);await new Promise(r=>setTimeout(r,55));const waiting=state.calls;
    allowed=true;await new Promise(r=>setTimeout(r,55));guard.dispose();return {waiting,calls:state.calls,paused:state.paused};
  })()`);
  assert.deepEqual(queued,{waiting:0,calls:1,paused:false});
  record('Losing foreground permission during a queued resume cancels that play attempt; returning to the course resumes once');

  const policy = await evaluate(`(()=>{const check=flowFixture.isCxPlaybackForeground;return [check({visibilityState:'visible',hasFocus:()=>true}),check({visibilityState:'visible',hasFocus:()=>false}),check({visibilityState:'hidden',hasFocus:()=>true}),check(null)];})()`);
  assert.deepEqual(policy,[true,false,false,false]);
  record('The LearningTong foreground check uses real visibility and focus and cannot treat a hidden or unfocused course as active');
  assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
};
