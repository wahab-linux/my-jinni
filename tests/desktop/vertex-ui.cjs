/* global window, document */
// Actual shared UI in Chromium with an isolated fake native bridge, not an Electron/live-Google test.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('node:http');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve('dist/pages');
  const scenarios = JSON.parse(await fs.readFile(path.join(root, 'decisions.json'), 'utf8')).scenarios;
  const planner = JSON.parse(await fs.readFile(path.join(root, 'scenario.json'), 'utf8'));
  const types = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' };
  const server = createServer(async (req,res) => {
    try {
      const name = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
      if (!name.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      res.writeHead(200, {'Content-Type':types[path.extname(name)] || 'application/octet-stream'}).end(await fs.readFile(name));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const errors=[];
  let checks=0;
  const check=async(name,action)=>{await action();checks++;console.log(`PASS ${name}`);};
  try {
    const context=await browser.newContext({viewport:{width:1280,height:950},reducedMotion:'reduce'});
    await context.addInitScript(({scenarios,planner})=>{
      const ok=data=>({status:200,body:{data,error:null,warnings:[]}});
      window.vertexTest={checks:[],questions:[],keys:{},fail:false};
      window.myJinni={
        getOptions:async()=>ok(planner.options),
        getDecisionScenarios:async()=>ok({scenarios:scenarios.map(x=>x.scenario)}),
        getDecisionScenario:async id=>ok(scenarios.find(x=>x.scenario.id===id)),
        evaluateDecision:async request=>({status:200,body:(await import('/decisions.mjs')).evaluateDecision(request,scenarios.find(x=>x.scenario.id===request.scenario_id))}),
        listSources:async()=>ok({sources:[],providers:[{id:'openai',label:'OpenAI',default_model:'gpt-4.1-mini'},{id:'gemini',label:'Google Gemini',default_model:'gemini-test'},{id:'vertex',label:'Google Vertex AI (ADC)',default_model:''}]}),
        getBackendStatus:async()=>({state:'ready'}),
        getSessionSettings:async provider=>({configured:!!window.vertexTest.keys[provider]}),
        setSessionApiKey:async value=>{window.vertexTest.keys[value.provider]=value.key;return {configured:true};},
        clearSessionApiKey:async provider=>{delete window.vertexTest.keys[provider];return {configured:false};},
        checkVertexAdc:async value=>{
          window.vertexTest.checks.push(value);
          return window.vertexTest.fail ? {status:401,body:{data:null,error:{code:'ADC_AUTH_ERROR',message:'Google sign-in was not found or has expired. Run gcloud auth application-default login, then check again.'},warnings:[]}} : ok({configured:true,...value,message:'Google sign-in works. Project permissions, model access and billing are checked when you ask a question.'});
        },
        askQuestion:async value=>{
          window.vertexTest.questions.push(value);
          return ok({provider:value.provider,model:value.model,status:'answered',answer:'Mocked Google answer.',citations:[{chunk_id:'decision-context',source_id:'decision-context',source_title:'Calculated comparison',quote:'Mocked exact quote',is_simulated:true}],decision:{scenario_id:value.decision_request.scenario_id},planner:null});
        },
      };
    },{scenarios,planner});
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}`;
    await page.goto(url); await page.locator('#desktop-ai-provider:not([disabled])').waitFor({state:'attached'});
    await page.locator('#desktop-ai-open').click();
    await check('ADC form hides API-key entry and explains Google sign-in without credential upload',async()=>{
      await page.locator('#desktop-ai-provider').selectOption('vertex');
      assert.equal(await page.locator('#desktop-vertex-settings').isVisible(),true);
      assert.equal(await page.locator('#desktop-ai-key-form').isVisible(),false);
      assert.equal(await page.locator('#desktop-ai-model').isVisible(),true);
      assert.equal(await page.locator('#desktop-ai-model').inputValue(),'');
      assert.match(await page.locator('#desktop-vertex-commands').textContent(),/gcloud auth application-default login/);
      assert.equal(await page.locator('#desktop-vertex-settings input[type=file]').count(),0);
    });
    await check('sign-in check sends project metadata only and does not ask a model',async()=>{
      await page.locator('#desktop-vertex-project').fill('my-trial-project');
      await page.locator('#desktop-vertex-location').fill('europe-west2');
      await page.locator('#desktop-ai-model').fill('gemini-test-model');
      await page.locator('#desktop-vertex-check').click();
      await page.waitForFunction(()=>document.querySelector('#desktop-vertex-status').textContent.includes('Google sign-in works'));
      assert.deepEqual(await page.evaluate(()=>window.vertexTest.checks),[{project_id:'my-trial-project',location:'europe-west2'}]);
      assert.deepEqual(await page.evaluate(()=>window.vertexTest.questions),[]);
    });
    await check('question explicitly includes the current comparison and ADC metadata with no key',async()=>{
      await page.locator('#desktop-ai-include-decision').check();
      await page.locator('#desktop-ai-question').fill('Explain the price and time.');
      await page.locator('#desktop-ai-ask').click();
      await page.locator('#desktop-ai-result').waitFor();
      const request=await page.evaluate(()=>window.vertexTest.questions[0]);
      assert.equal(request.provider,'vertex'); assert.equal(request.model,'gemini-test-model');
      assert.deepEqual(request.vertex,{project_id:'my-trial-project',location:'europe-west2'});
      assert.equal(request.decision_request.scenario_id,'travel');
      assert.equal(Object.keys(request).some(key=>/token|credential|api_key/.test(key)),false);
      await page.locator('#desktop-ai-citations button').click();
      assert.equal(await page.locator('#desktop-ai-context-dialog').isVisible(),true);
      await page.locator('#desktop-ai-context-close').click();
    });
    await check('changing project clears stale answers, and API-key providers retain their own keys',async()=>{
      await page.locator('#desktop-vertex-project').fill('another-trial-project');
      assert.equal(await page.locator('#desktop-ai-result').isVisible(),false);
      await page.locator('#desktop-ai-provider').selectOption('openai');
      await page.locator('#desktop-ai-settings > summary').click();
      await page.locator('#desktop-ai-key').fill('fake-openai-session-key');
      await page.locator('#desktop-ai-key-save').click();
      await page.waitForFunction(()=>window.vertexTest.keys.openai==='fake-openai-session-key');
      await page.locator('#desktop-ai-provider').selectOption('vertex');
      assert.equal(await page.locator('#desktop-vertex-project').inputValue(),'another-trial-project');
      assert.equal(await page.locator('#desktop-ai-model').inputValue(),'gemini-test-model');
      assert.deepEqual(await page.evaluate(()=>window.vertexTest.keys),{openai:'fake-openai-session-key'});
      assert.doesNotMatch(await page.evaluate(()=>JSON.stringify(localStorage)),/fake-openai|token|credential/i);
    });
    await check('missing ADC gives an actionable sign-in error, and invalid projects never reach the bridge',async()=>{
      await page.evaluate(()=>{window.vertexTest.fail=true;});
      await page.locator('#desktop-vertex-check').click();
      await page.waitForFunction(()=>document.querySelector('#desktop-vertex-status').textContent.includes('not found'));
      const count=await page.evaluate(()=>window.vertexTest.checks.length);
      await page.locator('#desktop-vertex-project').fill('../private'); await page.locator('#desktop-vertex-check').click();
      assert.equal(await page.evaluate(()=>window.vertexTest.checks.length),count);
      await page.locator('#desktop-vertex-project').fill('my-trial-project');
    });
    await check('ADC labels follow all five locales while project IDs and entered models remain original',async()=>{
      await page.locator('#desktop-ai-close').click();
      for(const locale of ['fr','ja','zh-CN','ru','en']) {
        await page.locator('#language-select').selectOption(locale);
        await page.locator('#desktop-ai-open').click();
        assert.equal(await page.locator('#desktop-vertex-project').inputValue(),'my-trial-project');
        assert.equal(await page.locator('#desktop-ai-model').inputValue(),'gemini-test-model');
        if(locale!=='en') assert.notEqual(await page.locator('#desktop-vertex-check').innerText(),'Check Google sign-in');
        await page.locator('#desktop-ai-close').click();
      }
    });
    await check('nonsecret Google settings survive reload and the form fits light, dark and narrow layouts',async()=>{
      await page.reload(); await page.locator('#desktop-ai-provider:not([disabled])').waitFor({state:'attached'});
      await page.locator('#desktop-ai-open').click(); await page.locator('#desktop-ai-provider').selectOption('vertex');
      assert.equal(await page.locator('#desktop-vertex-project').inputValue(),'my-trial-project');
      assert.equal(await page.locator('#desktop-vertex-location').inputValue(),'europe-west2');
      await fs.mkdir('tmp/desktop',{recursive:true});
      for(const theme of ['light','dark']) {
        await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
        await page.locator('#desktop-ai-dialog').screenshot({path:`tmp/desktop/vertex-${theme}.png`});
      }
      await page.setViewportSize({width:390,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      await page.locator('#desktop-ai-dialog').screenshot({path:'tmp/desktop/vertex-phone.png'});
      assert.deepEqual(errors,[]);
    });
    console.log(`ADC UI PASSED: ${checks} checks. Native bridge and Google are mocked; this is not an Electron window test.`);
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
