module.exports = async ({evaluate, record, assert}) => {
  await evaluate(`window.makeNativeRateFrame=async(rates)=>{const frame=document.createElement('iframe');frame.src='about:blank?objectid=target';await new Promise(resolve=>{frame.addEventListener('load',resolve,{once:true});document.body.append(frame);});const setRates=values=>{const doc=frame.contentDocument;doc.body.replaceChildren();const menu=doc.createElement('div');menu.className='vjs-playback-rate';for(const rate of values){const item=doc.createElement('span');item.className='vjs-menu-item-text';item.textContent=rate;menu.append(item);}doc.body.append(menu);};setRates(rates);return {frame,setRates};};`);
  const limits = await evaluate(`(async()=>{
    const {frame,setRates}=await makeNativeRateFrame(['1x','1.5x','2x','4x']);
    const attachment={isPassed:false,property:{objectid:'target',doublespeed:1}};
    const scope={baseURI:document.baseURI,defaultView:{mArg:{attachments:[attachment]}}};
    const allowed=flowFixture.getCxVideoRateLimit(frame,scope);
    attachment.property.doublespeed=0;const prohibited=flowFixture.getCxVideoRateLimit(frame,scope);
    attachment.isPassed=true;const completed=flowFixture.getCxVideoRateLimit(frame,scope);
    attachment.isPassed=false;delete attachment.property.doublespeed;const unknown=flowFixture.getCxVideoRateLimit(frame,scope);
    attachment.property.doublespeed=1;setRates(['NaNx','not a rate','0x']);const fallback=flowFixture.getCxVideoRateLimit(frame,scope);
    frame.remove();return {allowed,prohibited,completed,unknown,fallback};
  })()`);
  assert.deepEqual(limits,{allowed:4,prohibited:1,completed:4,unknown:1,fallback:2});
  record('Native rate menus can permit more than 2x; course prohibition wins, unknown permission stays at 1x, and malformed menus use the conservative fallback');

  const binding = await evaluate(`(async()=>{
    const {frame,setRates}=await makeNativeRateFrame(['1x','2x','4x']);
    const scope={baseURI:document.baseURI,defaultView:{mArg:{attachments:[{isPassed:false,property:{objectid:'target',doublespeed:1}}]}}};
    fixture.speedParam().value=8;await Vue.nextTick();const video=document.createElement('video');
    const controller=fixture.bindVideoPlaybackSpeed(video,fixture.config,()=>{},{getMaximumRate:()=>flowFixture.getCxVideoRateLimit(frame,scope)});
    const initial=video.playbackRate;setRates(['1x','2x']);video.dispatchEvent(new Event('loadedmetadata'));const smaller=video.playbackRate;
    setRates(['1x','4x']);video.dispatchEvent(new Event('loadedmetadata'));const restored=video.playbackRate;
    scope.defaultView.mArg.attachments[0].property.doublespeed=0;video.dispatchEvent(new Event('loadedmetadata'));const prohibited=video.playbackRate;
    const preferred=fixture.speedParam().value;controller.dispose();frame.remove();return {initial,smaller,restored,prohibited,preferred};
  })()`);
  assert.deepEqual(binding,{initial:4,smaller:2,restored:4,prohibited:1,preferred:8});
  record('The real media element follows native limits when metadata changes and preserves the selected speed across all temporary limits');

  const fractional = await evaluate(`(async()=>{fixture.speedParam().value=1.5;await Vue.nextTick();const video=document.createElement('video');const controller=fixture.bindVideoPlaybackSpeed(video,fixture.config,()=>{},{getMaximumRate:()=>1.25});const rate=video.playbackRate;controller.dispose();return rate;})()`);
  assert.equal(fractional,1);
  record('A fractional native maximum is rounded down to the slider step, so normalization cannot exceed the permitted rate');
};
