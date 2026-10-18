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
        setSessionApiKey:async value=>{
          if(window.vertexTest.failKeyStorage)return {status:503,body:{data:null,error:{code:'CREDENTIAL_STORAGE_ERROR',message:'Saved API keys could not be accessed securely. Check system encryption and try again.'},warnings:[]}};
          window.vertexTest.keys[value.provider]=value.key;return {configured:true};
        },
        clearSessionApiKey:async provider=>{delete window.vertexTest.keys[provider];return {configured:false};},
        checkVertexAdc:async value=>{
          window.vertexTest.checks.push(value);
          return window.vertexTest.fail ? {status:401,body:{data:null,error:{code:'ADC_AUTH_ERROR',message:'Google sign-in was not found or has expired. Run gcloud auth application-default login, then check again.'},warnings:[]}} : ok({configured:true,...value,message:'Google sign-in works. Project permissions, model access and billing are checked when you ask a question.'});
        },
        askQuestion:async value=>{
          window.vertexTest.questions.push(value);
          const citation={chunk_id:'decision-context',source_id:'decision-context',source_title:'Calculated comparison',quote:'Mocked exact quote',is_simulated:true};
          return ok({provider:value.provider,model:value.model,status:'answered',answer:'Mocked Google answer.',citations:[citation],options:value.intent==='options'?[{id:'first-choice',title:'First fictional choice',summary:'First mocked proposal.',trade_offs:['Verify the assumption.'],missing_information:['Current availability.'],citations:[citation]},{id:'second-choice',title:'Second fictional choice',summary:'Second mocked proposal.',trade_offs:[],missing_information:[],citations:[citation]}]:[],decision:{scenario_id:value.decision_request.scenario_id},planner:null});
        },
      };
    },{scenarios,planner});
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}`;
    await page.goto(url); await page.locator('#desktop-ai-provider:not([disabled])').waitFor({state:'attached'});
    const openSettings=async()=>{if(!await page.locator('#desktop-ai-settings').isVisible())await page.locator('#desktop-ai-settings-open').click();};
    const closeSettings=async()=>{if(await page.locator('#desktop-ai-settings').isVisible())await page.locator('#desktop-ai-settings-close').click();};
    await check('Ask is inline, settings are independent, and comparison controls remain interactive',async()=>{
      assert.equal(await page.locator('#desktop-ai-dialog').evaluate(node=>node.tagName),'SECTION');
      assert.equal(await page.locator('#desktop-ai-question').isVisible(),true);
      assert.equal(await page.locator('#desktop-ai-settings').isVisible(),false);
      await page.locator('#desktop-ai-open').click();
      assert.equal(await page.evaluate(()=>document.activeElement.id),'desktop-ai-question');
      await page.locator('#decision-submit').click();await page.locator('.decision-card').waitFor();
      assert.equal(await page.locator('dialog[open]').count(),0);
      await page.locator('#desktop-ai-settings-open').focus();await page.keyboard.press('Enter');
      assert.equal(await page.locator('#desktop-ai-settings').evaluate(node=>node.tagName),'DIALOG');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'desktop-ai-settings-open');
    });
    await openSettings();
    await check('ADC form hides API-key entry and explains Google sign-in without credential upload',async()=>{
      await page.locator('#desktop-ai-provider').selectOption('vertex');
      assert.equal(await page.locator('#desktop-vertex-settings').isVisible(),true);
      assert.equal(await page.locator('#desktop-ai-key-form').isVisible(),false);
      assert.equal(await page.locator('#desktop-ai-model-select').inputValue(),'__custom__');
      assert.equal(await page.locator('#desktop-ai-model').isVisible(),true);
      assert.equal(await page.locator('#desktop-ai-model').inputValue(),'');
      assert.match(await page.locator('#desktop-vertex-commands').textContent(),/gcloud auth application-default login/);
      assert.equal(await page.locator('#desktop-vertex-settings input[type=file]').count(),0);
    });
    await check('sign-in check sends project metadata only and does not ask a model',async()=>{
      await page.locator('#desktop-vertex-project').fill('my-trial-project');
      await page.locator('#desktop-vertex-location').fill('europe-west2');
      await page.locator('#desktop-ai-model-select').selectOption('__custom__');
      await page.locator('#desktop-ai-model').fill('gemini-test-model');
      await page.locator('#desktop-vertex-check').click();
      await page.waitForFunction(()=>document.querySelector('#desktop-vertex-status').textContent.includes('Google sign-in works'));
      assert.deepEqual(await page.evaluate(()=>window.vertexTest.checks),[{project_id:'my-trial-project',location:'europe-west2'}]);
      assert.deepEqual(await page.evaluate(()=>window.vertexTest.questions),[]);
    });
    await check('question explicitly includes the current comparison and ADC metadata with no key',async()=>{
      await closeSettings();
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
      await openSettings();
      await page.locator('#desktop-vertex-project').fill('another-trial-project');
      assert.equal(await page.locator('#desktop-ai-result').isVisible(),false);
      await page.locator('#desktop-ai-provider').selectOption('openai');
      await page.locator('#desktop-ai-key').fill('fake-openai-session-key');
      await page.locator('#desktop-ai-key-save').click();
      await page.waitForFunction(()=>window.vertexTest.keys.openai==='fake-openai-session-key');
      assert.equal(await page.locator('#desktop-ai-key').inputValue(),'');
      assert.match(await page.locator('#desktop-ai-key-status').innerText(),/saved on this device/);
      for(const locale of ['zh-CN','fr','ja','ru','en']) {
        await page.evaluate(id=>window.jinniI18n.setLocale(id),locale);
        assert.equal(await page.locator('#desktop-ai-key-save').innerText(),await page.evaluate(()=>window.jinniI18n.t('Save key on this device')));
        assert.equal(await page.locator('#desktop-ai-key-clear').innerText(),await page.evaluate(()=>window.jinniI18n.t('Delete this provider’s saved key')));
      }
      await page.locator('#desktop-ai-provider').selectOption('vertex');
      assert.equal(await page.locator('#desktop-vertex-project').inputValue(),'another-trial-project');
      assert.equal(await page.locator('#desktop-ai-model').inputValue(),'gemini-test-model');
      assert.equal(await page.locator('#desktop-ai-model-select').inputValue(),'__custom__');
      assert.deepEqual(await page.evaluate(()=>window.vertexTest.keys),{openai:'fake-openai-session-key'});
      assert.doesNotMatch(await page.evaluate(()=>JSON.stringify(localStorage)),/fake-openai|token|credential/i);
    });
    await check('Vertex option proposals use explicit ADC metadata and the current model without any API key',async()=>{
      await closeSettings();
      await page.locator('#decision-goal').fill('Suggest two fictional ways to make this journey.');
      await page.locator('#ai-options-generate').click();
      await page.locator('#ai-options-results .ai-option-card').first().waitFor();
      const request=await page.evaluate(()=>window.vertexTest.questions.at(-1));
      assert.equal(request.intent,'options');assert.equal(request.provider,'vertex');assert.equal(request.model,'gemini-test-model');
      assert.deepEqual(request.vertex,{project_id:'another-trial-project',location:'europe-west2'});
      assert.equal(request.decision_request.scenario_id,'travel');
      assert.equal(Object.keys(request).some(name=>/token|credential|api_key/.test(name)),false);
      assert.equal(await page.locator('#ai-options-results .ai-option-card').count(),2);
      await page.locator('#ai-options-results .ai-option-citation').first().click();
      assert.equal(await page.locator('#desktop-ai-context-quote').textContent(),'Mocked exact quote');
      await page.locator('#desktop-ai-context-close').click();await openSettings();
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
    await check('secure storage failures are visible without exposing entered keys and saved keys can be deleted',async()=>{
      await openSettings(); await page.locator('#desktop-ai-provider').selectOption('openai');
      await page.evaluate(()=>{window.vertexTest.failKeyStorage=true;});
      await page.locator('#desktop-ai-key').fill('fake-rejected-storage-key'); await page.locator('#desktop-ai-key-save').click();
      await page.waitForFunction(()=>document.querySelector('#desktop-ai-key-status').textContent.includes('Check system encryption'));
      assert.equal(await page.locator('#desktop-ai-key').inputValue(),'');
      assert.doesNotMatch(await page.locator('#desktop-ai-key-status').innerText(),/fake-rejected/);
      assert.equal(await page.evaluate(()=>window.vertexTest.keys.openai),'fake-openai-session-key');
      for(const locale of ['zh-CN','fr','ja','ru','en']) {
        await page.evaluate(id=>window.jinniI18n.setLocale(id),locale);
        assert.equal(await page.locator('#desktop-ai-key-status').innerText(),await page.evaluate(()=>window.jinniI18n.t('Saved API keys could not be accessed securely. Check system encryption and try again.')));
      }
      await page.evaluate(()=>{window.vertexTest.failKeyStorage=false;});
      await page.locator('#desktop-ai-key-clear').click();
      await page.waitForFunction(()=>!window.vertexTest.keys.openai);
      assert.equal(await page.locator('#desktop-ai-key-status').innerText(),'OpenAI saved key deleted.');
      await page.locator('#desktop-ai-provider').selectOption('vertex');
    });
    await check('ADC labels follow all five locales while project IDs and entered models remain original',async()=>{
      await closeSettings();
      for(const locale of ['fr','ja','zh-CN','ru','en']) {
        await page.locator('#language-select').selectOption(locale);
        await openSettings();
        assert.equal(await page.locator('#desktop-vertex-project').inputValue(),'my-trial-project');
        assert.equal(await page.locator('#desktop-ai-model').inputValue(),'gemini-test-model');
        if(locale!=='en') assert.notEqual(await page.locator('#desktop-vertex-check').innerText(),'Check Google sign-in');
        assert.equal(await page.locator('#desktop-ai-model-select').inputValue(),'__custom__');
        await closeSettings();
      }
    });
    await check('nonsecret Google settings survive reload and the form fits light, dark and narrow layouts',async()=>{
      await page.reload(); await page.locator('#desktop-ai-provider:not([disabled])').waitFor({state:'attached'});
      await openSettings(); await page.locator('#desktop-ai-provider').selectOption('vertex');
      assert.equal(await page.locator('#desktop-vertex-project').inputValue(),'my-trial-project');
      assert.equal(await page.locator('#desktop-vertex-location').inputValue(),'europe-west2');
      await fs.mkdir('tmp/desktop',{recursive:true});
      for(const theme of ['light','dark']) {
        await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
        await page.locator('#desktop-ai-settings').screenshot({path:`tmp/desktop/vertex-settings-${theme}.png`});
      }
      await page.setViewportSize({width:390,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      assert.ok(await page.locator('#desktop-ai-settings').evaluate(node=>node.scrollWidth<=node.clientWidth));
      await page.locator('#desktop-ai-settings').screenshot({path:'tmp/desktop/vertex-settings-phone.png'});
      await closeSettings();
      assert.equal(await page.locator('#desktop-ai-question').isVisible(),true);
      assert.deepEqual(errors,[]);
    });
    console.log(`ADC UI PASSED: ${checks} checks. Native bridge and Google are mocked; this is not an Electron window test.`);
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
