module.exports = async ({evaluate, record, assert}) => {
  const continuous = await evaluate(`(async()=>{
    const {video,state}=makeRecoveryVideo();let failures=0;
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:new AbortController().signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isFinished:()=>false,onFinished:()=>{},onFailure:()=>failures++,log:()=>{},delayMs:1,pollMs:5});
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
  assert.deepEqual(seeking,{calls:5,failures:1});
  record('Seeking without successful playback cannot reset the failure budget or produce unlimited play requests');

  const restartedBudget = await evaluate(`(async()=>{
    const {video,state}=makeRecoveryVideo();let failures=0,canPlay=false;
    video.play=async()=>{state.calls++;if(canPlay)state.paused=false;};
    state.paused=true;
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:new AbortController().signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isFinished:()=>false,onFinished:()=>{},onFailure:()=>failures++,log:()=>{},delayMs:1,pollMs:20});
    for(let i=0;i<200&&state.calls<2;i++)await new Promise(r=>setTimeout(r,1));
    canPlay=true;
    for(let i=0;i<200&&state.paused;i++)await new Promise(r=>setTimeout(r,1));
    video.currentTime+=1;video.dispatchEvent(new Event('timeupdate'));const recovered=state.calls;
    canPlay=false;video.pause();await new Promise(r=>setTimeout(r,190));
    const result={recovered,followingAttempts:state.calls-recovered,failures};guard.dispose();return result;
  })()`);
  assert.equal(restartedBudget.recovered,3);assert.equal(restartedBudget.followingAttempts,5);assert.equal(restartedBudget.failures,1);
  record('Actual progress after two failed starts restores the full bounded recovery budget for a later independent stall');

  const cancelled = await evaluate(`(async()=>{
    const {video,state}=makeRecoveryVideo();const controller=new AbortController();
    const guard=flowFixture.bindMediaPlaybackRecovery(video,{signal:controller.signal,isCurrent:()=>true,hasActiveQuiz:()=>false,isFinished:()=>false,onFinished:()=>{},onFailure:()=>{},log:()=>{},delayMs:15,pollMs:5});
    video.pause();controller.abort();video.currentTime=1;video.dispatchEvent(new Event('timeupdate'));video.dispatchEvent(new Event('seeked'));await new Promise(r=>setTimeout(r,45));guard.dispose();return {calls:state.calls};
  })()`);
  assert.deepEqual(cancelled,{calls:0});
  record('Progress events cannot revive a disposed or chapter-cancelled playback controller');
  assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
};
