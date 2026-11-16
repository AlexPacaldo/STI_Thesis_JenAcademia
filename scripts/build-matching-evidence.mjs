// Controlled documentation captures. No production database or live AI calls.
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {scoreTeacherForStudent,rankTeachers,selectTeacherFromRanking,assessMatchStrength} from '../backend/teacherMatching.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'docs/matching-evidence');
await mkdir(path.join(out,'images'),{recursive:true});
await mkdir(path.join(out,'qa'),{recursive:true});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const stamp=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',dateStyle:'long',timeStyle:'short'}).format(new Date())+' (Asia/Singapore)';
const suites=[];
for(const name of ['test-teacher-matching','test-match-insights','test-fallback']){
 const r=spawnSync(process.execPath,['scripts/'+name+'.mjs'],{cwd:root,encoding:'utf8',timeout:60000});
 const log=(r.stdout||'')+(r.stderr||'');
 await writeFile(path.join(out,name+'.txt'),log);
 suites.push({name,exit:r.status,summary:log.match(/\d+\/\d+ checks passed\./g)?.at(-1)||'No summary; inspect log',log});
}
const teachers=[
 {user_id:901,first_name:'Jamie',last_name:'Demo',specialization:'speaking and conversation',bio:'AI matching profile:\nTeaching style: conversational\nBest student pace: slow',experience_years:6,assigned_student_count:0,selected_course_match:1,role:'teacher',status:'active',profile_completed:1,email:'jamie@example.com'},
 {user_id:902,first_name:'Taylor',last_name:'Demo',specialization:'grammar and writing',bio:'AI matching profile:\nTeaching style: structured\nBest student pace: fast',experience_years:2,assigned_student_count:0,selected_course_match:1,role:'teacher',status:'active',profile_completed:1,email:'taylor@example.com'}
];
let capturedRequest,calculated;
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {createServer}=await import(pathToFileURL(require.resolve('vite')));
const server=await createServer({root:path.join(root,'frontend'),server:{host:'127.0.0.1',port:0}});
let browser;
try{
 await server.listen();
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:1050,deviceScaleFactor:1});
 const user={id:999,firstName:'Morgan',lastName:'Demo',role:'admin',profileCompleted:true,passwordChanged:true,status:'active',timezone:'Asia/Manila',stayLoggedIn:true};
 await page.evaluateOnNewDocument(u=>localStorage.setItem('JenAcademia.user',JSON.stringify(u)),user);
 await page.setRequestInterception(true);
 page.on('request',async req=>{
  const u=new URL(req.url());
  if(!u.pathname.startsWith('/api/'))return u.origin===base||u.protocol==='data:'?req.continue():req.abort();
  const headers={'access-control-allow-origin':base,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PUT,DELETE,PATCH,OPTIONS','content-type':'application/json'};
  if(req.method()==='OPTIONS')return req.respond({status:204,headers});
  let body={success:true,classes:[],records:[],requests:[],reviews:[],notifications:[],unreadCount:0,books:[],lessons:[],students:[],assignments:[],submissions:[],remarks:[],courses:[],users:[],conversations:[],progress:[],dates:[]};
  const p=u.pathname;
  if(p==='/api/courses')body={courses:[{course_id:1,course_name:'Conversational English'}]};
  else if(/^\/api\/users\/\d+$/.test(p))body={user:{...user,first_name:user.firstName,last_name:user.lastName,email:'demo@example.com',profile_completed:1}};
  else if(p==='/api/admin/users')body=u.searchParams.get('role')==='teacher'?teachers:[];
  else if(p==='/api/teacher-courses')body={teacherCourses:teachers.map(t=>({teacher_id:t.user_id,course_id:1}))};
  else if(p==='/api/admin/recommend-teacher'){
   capturedRequest=JSON.parse(req.postData());
   const ranked=rankTeachers(teachers.map(t=>scoreTeacherForStudent(t,capturedRequest.criteria,capturedRequest.trialNotes,1,capturedRequest.proficiencyLevel)));
   const selected=selectTeacherFromRanking(ranked,null);
   calculated={teacher:selected.assigned,ranked,matchStrength:assessMatchStrength(selected.assigned),usedLeastLoadedFallback:selected.usedLeastLoadedFallback,advisor:{used:false,configured:false,reason:'controlled-demo-no-live-ai'},aiInsights:{added:{},unavailable:true,reason:'not-configured'}};
   body=calculated;
  }
  await req.respond({status:200,headers,body:JSON.stringify(body)});
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/AdminDashboard?tab=createStudent',{waitUntil:'networkidle2'});
 await page.evaluate(()=>{for(const b of document.querySelectorAll('button'))if(['Skip for now','Close guide'].includes(b.textContent.trim()))b.click();});
 const course=await page.evaluate(()=>[...document.querySelectorAll('select')].map((s,i)=>({i,options:[...s.options].map(o=>({text:o.text,value:o.value}))})));
 const courseSelect=course.find(s=>s.options.some(o=>o.text==='Conversational English'));
 if(!courseSelect)throw Error('Course select not present: '+JSON.stringify(course));
 const sels=await page.$$('select');await sels[courseSelect.i].select('1');
 for(const [name,value] of [['student-learning-goal','conversation'],['student-focus-area','speaking'],['student-learning-style','conversational'],['student-pace','slow']]){
  const sel=`input[name="${name}"][value="${value}"]`;
  const found=await page.$(sel);
  if(found)await found.click();else {
   const info=await page.evaluate(()=>[...document.querySelectorAll('input')].filter(e=>e.type==='checkbox').map(e=>({name:e.name,value:e.value})));
   throw Error('Missing chip '+sel+' '+JSON.stringify(info));
  }
 }
 await page.type('textarea[placeholder^="Describe the student"]','Demo learner wants speaking practice, a conversational teaching style, and a slow pace.');
 await page.evaluate(()=>{const d=document.createElement('div');d.textContent='CONTROLLED DEMONSTRATION | FICTIONAL DATA | RULE-BASED MODE';Object.assign(d.style,{position:'fixed',top:'0',left:'0',right:'0',background:'#173d32',color:'white',textAlign:'center',padding:'8px',font:'bold 12px Arial',zIndex:'2147483647'});document.body.append(d);});
 await page.evaluate(()=>[...document.querySelectorAll('h4')].find(e=>e.textContent==='Matching Criteria')?.scrollIntoView({block:'start'}));
 await page.screenshot({path:path.join(out,'images/01-matching-inputs.png')});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Analyze with AI').click());
 await page.waitForFunction(()=>document.body.innerText.includes('Recommended teacher:'));
 const observed=await page.evaluate(()=>({ruleDisclosure:document.body.innerText.includes('The AI ranking is not configured, so these are the rule-based scores instead.'),assignedTeacher:[...document.querySelectorAll('select')].some(s=>s.value==='901')}));
 if(!observed.ruleDisclosure||!observed.assignedTeacher)throw Error('Unexpected rendered result '+JSON.stringify(observed));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Analyze with AI').scrollIntoView({block:'start'}));
 await page.screenshot({path:path.join(out,'images/02-matching-result.png')});
 if(calculated.teacher.user_id!==901)throw Error('Expected demo teacher 901');
 await writeFile(path.join(out,'demonstration-record.json'),JSON.stringify({stamp,capturedRequest,teachers,calculated,observed,errors,scope:'Real React UI; intercepted API executes imported deterministic scoring functions. No real HTTP backend, database, live Gemini or beta tester session.'},null,2));
 console.log(JSON.stringify({suites:suites.map(({name,exit,summary})=>({name,exit,summary})),teacher:calculated.teacher.user_id,errors}));
 // Report creation follows after successful capture.
 const section=(title,body)=>`<section><div class="eyebrow">JEN ACADEMIA / MATCHING VALIDATION</div><h1>${title}</h1>${body}</section>`;
 const table=(heads,rows)=>`<table><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
 const img=(file,caption)=>`<figure><img src="images/${file}"><figcaption>${caption}</figcaption></figure>`;
 const ranked=calculated.ranked;
 const sections=[
 section('AI Teacher Matching<br>Validation &amp; Beta Test Evidence',`<p class="lead">A traceable record of matching inputs, expected outcomes, observed demonstration results, and supporting software checks.</p><div class="callout"><b>Evidence status: controlled demonstration completed.</b><br>Beta tester verification is pending. No completed beta tester records were provided.</div><p><b>Prepared:</b> ${esc(stamp)}<br><b>System:</b> JEN Academia<br><b>Feature:</b> Administrator → Create Student → Analyze with AI</p><h2>What this report establishes</h2><p>The actual project interface displays a recommendation computed by the project’s rule-based scoring functions for a fictional two-teacher scenario. This report also records the outcomes of three existing automated check scripts.</p><h2>What remains to be verified</h2><p>Actual beta tester sessions, live AI ranking quality, production eligibility filtering, database persistence, and saved teacher assignments require separate evidence. The demonstration does not test those paths.</p><h2>How to complete beta verification</h2><ol><li>Have each tester run the feature in the intended test environment.</li><li>Record the inputs and expected acceptance criteria before analyzing.</li><li>Capture the recommendation, explanation and AI/fallback status.</li><li>Compare the actual result with the agreed criteria and have a reviewer confirm the finding.</li></ol><p class="small">Screenshots in this report are visibly labeled as controlled demonstrations. Teacher names and profiles are fictional. They must not be attributed to beta testers.</p>`),
 section('01 / Scenario and expected result',`<p>A controlled learner profile requests conversational English with speaking practice, conversational instruction, and a slow pace. No preferred schedule or proficiency evaluation is supplied.</p>${table(['Input','Recorded value'],[['Course','Conversational English (fixture course ID 1)'],['Learning goal','conversation'],['Focus area','speaking'],['Learning style','conversational'],['Learning pace','slow'],['Proficiency / schedule','Not supplied; these checks are outside this scenario']])}<h2>Candidate profiles</h2>${table(['Teacher','Specialization / style / pace','Experience / load'],teachers.map(t=>[esc(t.first_name+' '+t.last_name)+' (ID '+t.user_id+')',esc(t.specialization)+'<br>'+ (t.user_id===901?'conversational / slow':'structured / fast'),t.experience_years+' years / 0 active students']))}<h2>Expected outcome, defined from inputs</h2><p>Jamie Demo should rank above Taylor Demo and be selected: Jamie matches the learner’s goal, focus, style and pace, while both candidates have equal course-match flags and zero workload. The UI should identify rule-based mode because no live AI advisor is used.</p><div class="callout">The candidate pool is supplied by the capture harness. Course eligibility, active status and account completeness are fixture assumptions, not independently verified backend filtering.</div>`),
 section('02 / Screenshot: matching inputs',`${img('01-matching-inputs.png','Figure 1. Real project interface with fictional matching criteria selected. Controlled local capture; no beta tester participated.')}<h2>What to check</h2><p>The selected chips show the criteria sent to the matcher. The trial notes describe the same needs. Changing criteria requires another analysis so the displayed recommendation corresponds to the current inputs.</p><p><b>Trace:</b> The request body is retained in <code>demonstration-record.json</code>. The screenshot is retained as <code>images/01-matching-inputs.png</code>.</p><p class="small">Capture method: local Vite frontend, isolated fictional administrator session, intercepted API responses. No production record is created.</p>`),
 section('03 / Screenshot: observed recommendation',`${img('02-matching-result.png','Figure 2. The recommendation card rendered by the project interface. Its response was computed using imported rule-based matching functions, with AI disabled.')} ${table(['Check','Expected','Observed'],[['Selected teacher','Jamie Demo (901)',esc(calculated.teacher.first_name+' '+calculated.teacher.last_name)+' ('+calculated.teacher.user_id+')'],['Mode disclosure','Rule-based; AI not configured','Rule-based disclosure rendered'],['Selected-criteria coverage','All supplied matching criteria',calculated.matchStrength.matched+' / '+calculated.matchStrength.total+' ('+calculated.matchStrength.level+')']])}<p><b>Outcome:</b> The controlled scenario selected the expected teacher. This is a demonstration result, not a completed beta acceptance result.</p>`),
 section('04 / Supporting software checks',`<p>The existing scripts below were executed during report preparation. Their logs are saved alongside this document. These are software checks using synthetic inputs and controlled conditions.</p>${table(['Existing check script','Recorded summary','Exit'],suites.map(s=>['<code>'+s.name+'.mjs</code>',esc(s.summary),String(s.exit)]))}<h2>Computed demonstration ranking</h2>${table(['Rank / teacher','Rule score','Criterion coverage'],ranked.map((t,i)=>[(i+1)+' / '+esc(t.first_name+' '+t.last_name),String(t.score),t.criterionMatched+' / '+t.criterionTotal]))}<p>Scores are internal ranking values, not accuracy percentages or confidence probabilities. Coverage counts the selected criteria recognized by the scoring function.</p><h2>Interpreting “correct”</h2><p>For rule-based mode, compare the returned teacher with the documented scoring, workload and selection policy. For AI-assisted mode, assess whether the recommendation meets a reviewer-defined acceptance rubric; an exact repeated ranking is not assumed.</p><p>Record <code>advisor.used</code> for a live session: true means the AI advisor contributed a ranking; false means a rules-only result. A fallback result must be reported as fallback.</p><div class="callout">Passing software checks does not establish beta tester participation, user satisfaction, live model accuracy, or end-to-end persistence.</div>`),
 section('05 / Beta tester verification record',`<p class="lead">Complete one copy per tester and scenario. All fields below are pending; no beta outcome is asserted.</p>${table(['Record field','Tester / reviewer entry'],[['Tester code / role','________________________________________'],['Case ID / date / time / timezone','________________________________________'],['Environment URL / build or commit','________________________________________'],['Learner ID (pseudonym) / selected course','________________________________________'],['Goal / focus / style / pace / level','________________________________________'],['Candidate pool / load / schedule snapshot','________________________________________'],['Expected outcome / accepted alternatives','________________________________________'],['Actual recommended teacher / explanation','________________________________________'],['AI used or fallback / displayed reason','________________________________________'],['Evidence filenames / original capture times','________________________________________'],['Final assignment, if tested / saved record ID','________________________________________'],['Verdict: pass / fail / blocked / not run','________________________________________'],['Mismatch / defect ID / retest result','________________________________________']])}<h2>Tester confirmation</h2><p>I performed the recorded actions and confirm that the attached original screenshots represent the result I received.</p><p>Tester name or code: __________________ &nbsp; Date: ______________</p><p>Signature / recorded acknowledgment: __________________________</p><p>Reviewer: __________________ &nbsp; Review date: _________________</p>`),
 section('06 / Evidence checklist and conclusion',`<h2>Attach these screenshots for each beta case</h2><ol><li><b>Before analysis:</b> selected course, learner criteria, proficiency, preferred schedule and relevant trial notes.</li><li><b>Candidate basis:</b> relevant teacher profiles, course eligibility, current load and availability used for comparison.</li><li><b>After analysis:</b> recommended teacher, reasons, warnings, criterion coverage and AI/fallback status.</li><li><b>After save, when in scope:</b> the persisted assignment or student record, then reopen it to confirm the saved teacher.</li></ol><p>Use filenames such as <code>BT01-TC01-input.png</code> and <code>BT01-TC01-result.png</code>. Retain originals and map each image to the tester code, case ID and capture time. Hide unrelated personal information, passwords and tokens.</p><h2>Minimum scenario coverage</h2>${table(['Case','Acceptance focus'],[['TC01 / strong fit','Appropriate specialization, style and pace; reasons agree with profile.'],['TC02 / weak or partial fit','Closest candidate is labeled honestly; missing criteria are visible.'],['TC03 / workload or availability','Recommendation and warnings follow the applicable load and schedule policy.'],['TC04 / no eligible teachers','Clear no-candidate message; no invented teacher.'],['TC05 / AI unavailable','Rule-based fallback is usable and explicitly disclosed.'],['TC06 / saved assignment','Selected teacher persists when the authorized create/save flow is completed.']])}<h2>Current conclusion</h2><p>The controlled demonstration returned the expected rule-based teacher. Automated script outcomes are listed on page 5. Beta tester success rates and live AI correctness remain undetermined until completed session records are attached and reviewed.</p><p class="small">Implementation references: backend/teacherMatching.js; backend/teacherAdvisor.js; backend/matchInsights.js; backend/server.js; frontend/src/pages/AdminDashboard.jsx; scripts/build-matching-evidence.mjs. The capture harness replaces API transport and does not exercise the full server route.</p>`)
 ];
 const html=`<!doctype html><html><head><meta charset="utf-8"><title>JEN Academia Matching Validation</title><style>@page{size:A4;margin:16mm 17mm 18mm}*{box-sizing:border-box}body{font:11pt/1.45 Arial,sans-serif;color:#21382f;margin:0}section{break-after:page}section:last-child{break-after:auto}.eyebrow{font-size:8pt;letter-spacing:1.5px;color:#6d826f;border-bottom:2px solid #b9aa74;padding-bottom:9px;margin-bottom:20px}h1{font-size:25pt;line-height:1.15;margin:0 0 18px;color:#173d32}h2{font-size:13pt;margin:19px 0 7px}p{margin:8px 0}.lead{font-size:13pt;color:#52685b}.callout{background:#eef3ef;border-left:4px solid #9c8957;padding:13px;margin:18px 0}table{border-collapse:collapse;width:100%;font-size:9pt;margin:12px 0}th{text-align:left;background:#173d32;color:white}th,td{padding:8px;border:1px solid #cbd5cd;vertical-align:top}tr{break-inside:avoid}figure{margin:12px 0}img{width:100%;display:block;border:1px solid #cbd5cd}figcaption,.small{font-size:9pt;color:#617267}figcaption{margin-top:7px}li{padding:3px 0}code{font-size:9pt;overflow-wrap:anywhere}</style></head><body>${sections.join('')}</body></html>`;
 await writeFile(path.join(out,'AI_Teacher_Matching_Validation.html'),html);
 page.removeAllListeners('request');
 await page.setRequestInterception(false);
 await page.goto(pathToFileURL(path.join(out,'AI_Teacher_Matching_Validation.html')).href,{waitUntil:'networkidle0'});
 await page.pdf({path:path.join(out,'AI_Teacher_Matching_Validation.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:'<div style="font:8px Arial;color:#617267;width:100%;margin:0 17mm;display:flex;justify-content:space-between"><span>JEN ACADEMIA | CONTROLLED DEMONSTRATION + BETA VERIFICATION FORM</span><span class="pageNumber"></span></div>'});
 // Render final PDF pages through PDF.js for visual inspection.
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{window.pdfjs=await import('/node_modules/pdfjs-dist/build/pdf.mjs');window.pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.mjs';});
 const data=(await readFile(path.join(out,'AI_Teacher_Matching_Validation.pdf'))).toString('base64');
 const count=await page.evaluate(async b=>{window.reviewPdf=await pdfjs.getDocument({data:Uint8Array.from(atob(b),c=>c.charCodeAt(0))}).promise;return reviewPdf.numPages;},data);
 for(let i=1;i<=count;i++){
  const png=await page.evaluate(async n=>{const p=await reviewPdf.getPage(n);const vp=p.getViewport({scale:1.2});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return c.toDataURL().split(',')[1];},i);
  await writeFile(path.join(out,`qa/page-${i}.png`),Buffer.from(png,'base64'));
 }
 console.log('PDF rendered:',count,'pages');
}finally{await browser?.close();await server.close();}
