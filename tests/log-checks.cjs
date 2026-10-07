module.exports=async({evaluate,record,assert})=>{
  const result=await evaluate(`(async()=>{const s=logFixture.store;s.logList.splice(0);s.addLog('真实故障：无法保存','error');s.addLog('需要本人处理的验证','warning');s.addLog('正在播放','primary');await Vue.nextTick();return {types:s.logList.map(x=>x.type),danger:!!logFixture.host.querySelector('.el-text--danger'),warning:!!logFixture.host.querySelector('.el-text--warning'),text:logFixture.host.textContent};})()`);
  assert.deepEqual(result.types,['danger','warning','primary']);assert.equal(result.danger,true);assert.equal(result.warning,true);assert.match(result.text,/真实故障：无法保存/);
  record('Regression: an error log uses the supported danger type and appears red; genuine warnings remain visible in the actual Home component');
  const fallback=await evaluate(`(async()=>{logFixture.store.addLog('正常状态');logFixture.store.addLog('旧格式日志','unsupported');await Vue.nextTick();return logFixture.store.logList.slice(-2).map(x=>x.type);})()`);
  assert.deepEqual(fallback,['primary','primary']);
  record('Missing and unknown log types use a valid informational color without invalid component props');
  assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
};
