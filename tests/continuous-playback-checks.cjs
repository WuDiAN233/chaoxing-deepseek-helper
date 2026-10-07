module.exports = async ({evaluate, record, assert}) => {
  const continuous = await evaluate(`(async()=>{
    const {video,state}=makeRecoveryVideo();let failures=0;
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:new AbortController().signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isFinished:()=>false,onFinished:()=>{},onFailure:()=>failures++,log:()=>{},delayMs:1,maxRetryDelayMs:5,pollMs:5});
    for(let i=0;i<8;i++){
      video.pause();await new Promise(r=>setTimeout(r,20));
      if(!state.paused){video.currentTime+=1;video.dispatchEvent(new Event('timeupdate'));}
    }
    const result={calls:state.calls,paused:state.paused,failures,time:video.currentTime};guard.dispose();return result;
  })()`);
  assert.deepEqual(continuous,{calls:8,paused:false,failures:0,time:8});
  record('Regression: eight pauses followed by genuine playback progress resume throughout, without exhausting the failed-play budget');

  const seeking = await evaluate(`(async()=>{
    const {video,state}=makeRecoveryVideo();let failures=0;
    video.play=async()=>{state.calls++;video.currentTime+=5;video.dispatchEvent(new Event('seeking'));video.dispatchEvent(new Event('timeupdate'));video.dispatchEvent(new Event('seeked'));};
    state.paused=true;
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:new AbortController().signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isFinished:()=>false,onFinished:()=>{},onFailure:()=>failures++,log:()=>{},delayMs:1,pollMs:5});
    await new Promise(r=>setTimeout(r,150));const result={calls:state.calls,failures};guard.dispose();return result;
  })()`);
  assert.ok(seeking.calls>5);assert.ok(seeking.calls<40);assert.equal(seeking.failures,0);
  record('Seeking without successful playback preserves retry throttling while the playback watcher remains active');

  const restartedBudget = await evaluate(`(async()=>{
    const {video,state}=makeRecoveryVideo();let failures=0,canPlay=false;
    video.play=async()=>{state.calls++;if(canPlay)state.paused=false;};
    state.paused=true;
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:new AbortController().signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isFinished:()=>false,onFinished:()=>{},onFailure:()=>failures++,log:()=>{},delayMs:1,maxRetryDelayMs:5,pollMs:20});
    for(let i=0;i<200&&state.calls<2;i++)await new Promise(r=>setTimeout(r,1));
    canPlay=true;
    for(let i=0;i<200&&state.paused;i++)await new Promise(r=>setTimeout(r,1));
    video.currentTime+=1;video.dispatchEvent(new Event('timeupdate'));const recovered=state.calls;
    canPlay=false;video.pause();await new Promise(r=>setTimeout(r,190));
    const followingAttempts=state.calls-recovered;canPlay=true;await new Promise(r=>setTimeout(r,30));const result={recovered,followingAttempts,failures,paused:state.paused};guard.dispose();return result;
  })()`);
  assert.equal(restartedBudget.recovered,3);assert.ok(restartedBudget.followingAttempts>5);assert.equal(restartedBudget.failures,0);assert.equal(restartedBudget.paused,false);
  record('A later independent stall still resumes after more than five failed attempts without rebuilding the controller');

  const rejection = await evaluate(`(async()=>{
    const {video,state}=makeRecoveryVideo();state.paused=true;let warnings=0;
    video.play=async()=>{state.calls++;if(state.calls<=7)throw new DOMException('temporary block','NotAllowedError');state.paused=false;};
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:new AbortController().signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isFinished:()=>false,onFinished:()=>{},onFailure:()=>{},log:(m,t)=>{if(t==='warning')warnings++;},delayMs:1,maxRetryDelayMs:5,pollMs:5});
    await new Promise(r=>setTimeout(r,150));guard.dispose();return {calls:state.calls,paused:state.paused,warnings};
  })()`);
  assert.equal(rejection.calls,8);assert.equal(rejection.paused,false);assert.equal(rejection.warnings,1);
  record('Seven temporary native play rejections produce one warning and a successful eighth start, rather than closing recovery');

  const cancelled = await evaluate(`(async()=>{
    const {video,state}=makeRecoveryVideo();const controller=new AbortController();
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:controller.signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isFinished:()=>false,onFinished:()=>{},onFailure:()=>{},log:()=>{},delayMs:15,pollMs:5});
    video.pause();controller.abort();video.currentTime=1;video.dispatchEvent(new Event('timeupdate'));video.dispatchEvent(new Event('seeked'));await new Promise(r=>setTimeout(r,45));guard.dispose();return {calls:state.calls};
  })()`);
  assert.deepEqual(cancelled,{calls:0});
  record('Progress events cannot revive a disposed or chapter-cancelled playback controller');
  assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
};
