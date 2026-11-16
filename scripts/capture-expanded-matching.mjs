// Documentation only: real UI + imported scoring functions; isolated fictional data.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {scoreTeacherForStudent,rankTeachers,selectTeacherFromRanking,assessMatchStrength} from '../backend/teacherMatching.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'docs/matching-evidence');
await mkdir(path.join(out,'images/expanded'),{recursive:true});
const profiles=[
 [901,'Jamie','speaking and conversation','conversational','slow',6,0],
 [902,'Taylor','grammar and writing','structured','fast',2,0],
 [903,'Alex','listening and pronunciation','visual','balanced',5,1],
 [904,'Sam','news discussion, speaking and conversation','interactive','balanced',7,0],
 [905,'Morgan','speaking and conversation','conversational','fast',8,3],
 [906,'Casey','speaking and conversation','interactive','fast',4,0],
 [907,'Riley','listening and pronunciation','structured','review-heavy',3,0],
 [908,'Jordan','reading and vocabulary','independent','balanced',2,1],
];
const teachers=profiles.map(([user_id,first_name,specialization,style,pace,experience_years,assigned_student_count])=>({user_id,first_name,last_name:'Demo',specialization,bio:`AI matching profile:\nTeaching style: ${style}\nBest student pace: ${pace}`,style,pace,experience_years,assigned_student_count,selected_course_match:1,role:'teacher',status:'active',profile_completed:1,email:`teacher${user_id}@example.com`}));
const scenarios=[
 {id:'DEMO-01',studentId:1101,student:'Lea Demo',title:'Guided conversation',goal:'conversation',focus:'speaking',style:'conversational',pace:'slow',expected:901,why:'Jamie matches all four selected criteria and has no assigned students.'},
 {id:'DEMO-02',studentId:1102,student:'Noah Demo',title:'Visual listening practice',goal:'confidence',focus:'listening',style:'visual',pace:'balanced',expected:903,why:'Alex matches listening, visual instruction and balanced pace. Confidence is not matched by this teacher’s specialization, so partial coverage is expected.'},
 {id:'DEMO-03',studentId:1103,student:'Mia Demo',title:'Interactive news discussion',goal:'news-discussion',focus:'speaking',style:'interactive',pace:'balanced',expected:904,why:'Sam covers news discussion and speaking, with the requested interactive style and balanced pace.'},
 {id:'DEMO-04',studentId:1104,student:'Ethan Demo',title:'Fast interactive speaking',goal:'conversation',focus:'speaking',style:'interactive',pace:'fast',expected:906,why:'Casey matches the conversation goal, speaking focus, interactive style and fast pace, while staying below the load preference.'},
 {id:'DEMO-05',studentId:1105,student:'Zoe Demo',title:'Structured pronunciation review',goal:'confidence',focus:'pronunciation',style:'structured',pace:'review-heavy',expected:907,why:'Riley matches pronunciation, structured instruction and review-heavy pace. Confidence is not matched by this specialization, so partial coverage is expected.'},
];
const suites=[];
for(const name of ['test-teacher-matching','test-match-insights','test-fallback']){
 const r=spawnSync(process.execPath,[`scripts/${name}.mjs`],{cwd:root,encoding:'utf8',timeout:60000});
 const log=(r.stdout||'')+(r.stderr||'');await writeFile(path.join(out,`${name}.txt`),log);
 suites.push({name,exit:r.status,summary:log.match(/\d+\/\d+ checks passed\./g)?.at(-1)||'No summary'});
 if(r.status!==0)throw Error(`${name} failed`);
}
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {createServer}=await import(pathToFileURL(require.resolve('vite')));
const server=await createServer({root:path.join(root,'frontend'),server:{host:'127.0.0.1',port:0}});
let browser;const records=[];
try{
 await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 for(const scenario of scenarios){
  const context=await browser.createBrowserContext();const page=await context.newPage();
  await page.setViewport({width:1440,height:1050,deviceScaleFactor:1});
  const user={id:999,firstName:'Avery',lastName:'Demo',role:'admin',profileCompleted:true,passwordChanged:true,status:'active',timezone:'Asia/Manila',stayLoggedIn:true};
  await page.evaluateOnNewDocument(u=>localStorage.setItem('JenAcademia.user',JSON.stringify(u)),user);
  let request,result;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',async req=>{
   const u=new URL(req.url());if(!u.pathname.startsWith('/api/'))return u.origin===base||u.protocol==='data:'?req.continue():req.abort();
   const headers={'access-control-allow-origin':base,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PUT,DELETE,PATCH,OPTIONS','content-type':'application/json'};
   if(req.method()==='OPTIONS')return req.respond({status:204,headers});
   let body={success:true,classes:[],records:[],requests:[],reviews:[],notifications:[],unreadCount:0,books:[],lessons:[],students:[],assignments:[],submissions:[],remarks:[],courses:[],users:[],conversations:[],progress:[],dates:[]};
   const p=u.pathname;
   if(p==='/api/courses')body={courses:[{course_id:1,course_name:'Conversational English'}]};
   else if(/^\/api\/users\/\d+$/.test(p))body={user:{...user,first_name:user.firstName,last_name:user.lastName,email:'demo@example.com',profile_completed:1}};
   else if(p==='/api/admin/users')body=u.searchParams.get('role')==='teacher'?teachers:[];
   else if(p==='/api/teacher-courses')body={teacherCourses:teachers.map(t=>({teacher_id:t.user_id,course_id:1}))};
   else if(p==='/api/admin/recommend-teacher'){
    request=JSON.parse(req.postData());
    const ranked=rankTeachers(teachers.map(t=>scoreTeacherForStudent(t,request.criteria,request.trialNotes,1,request.proficiencyLevel)));
    const selected=selectTeacherFromRanking(ranked,null);
    result={teacher:selected.assigned,ranked,matchStrength:assessMatchStrength(selected.assigned),usedLeastLoadedFallback:selected.usedLeastLoadedFallback,advisor:{used:false,configured:false,reason:'controlled-demo-no-live-ai'},aiInsights:{added:{},unavailable:true,reason:'not-configured'}};
    body=result;
   }
   await req.respond({status:200,headers,body:JSON.stringify(body)});
  });
  await page.goto(base+'/AdminDashboard?tab=createStudent',{waitUntil:'networkidle2'});
  await page.evaluate(()=>{for(const b of document.querySelectorAll('button'))if(['Skip for now','Close guide'].includes(b.textContent.trim()))b.click();});
  const index=await page.evaluate(()=>[...document.querySelectorAll('select')].findIndex(s=>[...s.options].some(o=>o.text==='Conversational English')));
  if(index<0)throw Error('Course select missing');const selects=await page.$$('select');await selects[index].select('1');
  for(const [field,value] of [['student-learning-goal',scenario.goal],['student-focus-area',scenario.focus],['student-learning-style',scenario.style],['student-pace',scenario.pace]])await page.click(`input[name="${field}"][value="${value}"]`);
  await page.type('textarea[placeholder^="Describe the student"]',`${scenario.student} (${scenario.id}): ${scenario.title}. Fictional demonstration learner; criteria are selected above.`);
  await page.evaluate(s=>{const d=document.createElement('div');d.textContent=`${s.id} | ${s.student} | 8 TEACHER CANDIDATES | FICTIONAL DATA | RULE-BASED DEMO`;Object.assign(d.style,{position:'fixed',top:'0',left:'0',right:'0',background:'#173d32',color:'white',textAlign:'center',padding:'8px',font:'bold 12px Arial',zIndex:'2147483647'});document.body.append(d);},scenario);
  await page.evaluate(()=>[...document.querySelectorAll('h4')].find(e=>e.textContent==='Matching Criteria')?.scrollIntoView({block:'start'}));
  const inputs=`images/expanded/${scenario.id}-inputs.png`,output=`images/expanded/${scenario.id}-result.png`;
  await page.screenshot({path:path.join(out,inputs)});
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Analyze with AI').click());
  await page.waitForFunction(()=>document.body.innerText.includes('Recommended teacher:'));
  const observed=await page.evaluate(expected=>({disclosed:document.body.innerText.includes('The AI ranking is not configured, so these are the rule-based scores instead.'),selected:[...document.querySelectorAll('select')].some(s=>s.value===String(expected)),candidateOptions:[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='901'))?.options.length-1}),scenario.expected);
  if(result.teacher.user_id!==scenario.expected||!observed.disclosed||!observed.selected||observed.candidateOptions!==8||errors.length)throw Error(`${scenario.id} mismatch: ${JSON.stringify({observed,result:result.teacher.user_id,errors})}`);
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Analyze with AI').scrollIntoView({block:'start'}));
  await page.screenshot({path:path.join(out,output)});
  records.push({...scenario,request,result,observed,errors,inputs,output,outcome:'PASS (controlled demonstration)'});
  console.log(`${scenario.id}: ${scenario.student} -> ${result.teacher.first_name} Demo; ${result.matchStrength.matched}/${result.matchStrength.total}; 8 candidates`);
  await context.close();
 }
 const data={stamp:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',dateStyle:'long',timeStyle:'short'}).format(new Date())+' (Asia/Singapore)',teachers,records,suites,scope:'Real React frontend; intercepted API executes imported deterministic scoring and selection. Eight fixed eligible candidates, five independent fictional learners. No database writes or live AI calls. Not beta tester evidence.'};
 await writeFile(path.join(out,'expanded-demonstration-record.json'),JSON.stringify(data,null,2));
}finally{await browser?.close();await server.close();}
