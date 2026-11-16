// Documentation illustrations: real frontend, fictional data, no database connection.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')));
const out = fileURLToPath(new URL('../docs/user-manuals/images/', import.meta.url));
await mkdir(out, {recursive:true});
const server = await createServer({root:fileURLToPath(new URL('../frontend', import.meta.url)),server:{host:'127.0.0.1',port:0}});
let browser;
const report=process.argv[2]?JSON.parse(await readFile(out+'capture-report.json','utf8')):[];
try {
 await server.listen();
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 for(const [name,role,route] of [
  ['visitor-home',null,'/'],['sign-in',null,'/login'],['password-recovery',null,'/forgot-password'],
  ['student-home','student','/StudentDashboard'],['student-calendar','student','/Calendar'],['student-assignments','student','/assignments'],
  ['teacher-calendar','teacher','/Calendar'],['teacher-students','teacher','/teacherStudents'],['teacher-assignments','teacher','/teacherAssignment'],
  ['admin-create-teacher','admin','/AdminDashboard?tab=createTeacher'],['admin-create-student','admin','/AdminDashboard?tab=createStudent'],
  ['admin-contracts','admin','/AdminDashboard?tab=contracts'],['admin-library','admin','/AdminDashboard?tab=books'],
  ['super-admin-create','super','/AdminDashboard?tab=createAdmin']]) {
  if(process.argv[2] && name!==process.argv[2])continue;
  const context=await browser.createBrowserContext();
  const page=await context.newPage();
  await page.setViewport({width:1440,height:1050,deviceScaleFactor:1});
  const user={id:role==='student'?101:role==='teacher'?201:301,firstName:role==='student'?'Alex':role==='teacher'?'Jamie':'Morgan',lastName:'Sample',role:role==='super'?'admin':role,isSuperAdmin:role==='super',profileCompleted:true,passwordChanged:true,status:'active',timezone:'Asia/Manila',stayLoggedIn:true};
  const pkg={package_id:1,course_id:1,course_name:'Conversational English',teacher_id:201,total_classes:10,used_classes:2,classes_left:8,available_classes:6,reserved_classes:2,class_duration:25,status:'active',expires_at:'2027-01-31',expiry_date:'2027-01-31'};
  const students=[{user_id:101,id:101,first_name:'Alex',last_name:'Sample',email:'alex@example.com',course_id:1,course_name:'Conversational English',package_status:'active',total_classes:10,used_classes:2,classes_left:8,class_duration:25,status:'active',profile_completed:1}];
  await page.evaluateOnNewDocument((u)=>{if(u.role)localStorage.setItem('JenAcademia.user',JSON.stringify(u));},user);
  await page.setRequestInterception(true);
  page.on('request',async req=>{
   const url=new URL(req.url());
   if(!url.pathname.startsWith('/api/')) return url.origin===base || url.protocol==='data:' ? req.continue():req.abort();
   const headers={'access-control-allow-origin':base,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PUT,DELETE,PATCH,OPTIONS','content-type':'application/json'};
   if(req.method()==='OPTIONS')return req.respond({status:204,headers});
   let body={success:true,classes:[],records:[],requests:[],reviews:[],notifications:[],unreadCount:0,books:[],lessons:[],students:[],assignments:[],submissions:[],remarks:[],courses:[],users:[],conversations:[],progress:[],dates:[]};
   const p=url.pathname;
   if(p==='/api/courses')body={courses:[{course_id:1,course_name:'Conversational English'}]};
   else if(p.includes('/line'))body={linked:true,setupRequired:false,remindersEnabled:true};
   else if(/^\/api\/users\/\d+$/.test(p))body={user:{...user,first_name:user.firstName,last_name:user.lastName,email:'sample@example.com',country:'Philippines',birthday:'2000-01-01',profile_completed:1}};
   else if(p.includes('student-package'))body={package:pkg,latest_package:pkg};
   else if(p.includes('assigned-teacher'))body={assigned_teacher_id:201,teacher:{user_id:201,first_name:'Jamie',last_name:'Sample',timezone:'Asia/Manila'}};
   else if(p==='/api/admin/users')body=url.searchParams.get('role')==='student'?students:[{user_id:201,first_name:'Jamie',last_name:'Sample',role:'teacher',email:'jamie@example.com',profile_completed:1,status:'active'}];
   else if(p==='/api/teacher-courses')body={assignments:[],teacherCourses:[]};
   else if(p.includes('/students'))body={students};
   else if(p.includes('/assignments'))body={assignments:[{id:501,assignment_id:501,student_id:101,title:'Introduce yourself',name:'Introduce yourself',instructions:'Write five sentences introducing yourself. Include your interests and learning goals.',subject:'Conversational English',postedAt:'2026-11-16T01:00:00Z',dueDate:'2026-11-23',dueTime:'18:00',attemptLimit:3}]};
   else if(p.includes('/dashboard/'))body={classes:[],students,assignments:[],submissions:[],books:[],remarks:[],package:pkg,courses:[],assignedTeacher:{user_id:201,first_name:'Jamie',last_name:'Sample'}};
   await req.respond({status:200,headers,body:JSON.stringify(body)});
  });
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+route,{waitUntil:'networkidle2',timeout:60000});
  await page.evaluate(()=>document.fonts.ready);
  if(name==='super-admin-create'){
   // The page initially normalizes the deep link while its local user is loading.
   // Use the visible navigation after the profile is initialized.
   await page.waitForSelector('a[href="/AdminDashboard?tab=createAdmin"]');
   await page.click('a[href="/AdminDashboard?tab=createAdmin"]');
   await page.waitForFunction(()=>[...document.querySelectorAll('h2')].some(h=>h.textContent==='Create Admin Account'));
  }
  // Dismiss the real onboarding controls so they do not obscure the task being illustrated.
  await page.evaluate(()=>{for(const b of document.querySelectorAll('button'))if(['Skip for now','Close guide'].includes(b.textContent.trim()))b.click();});
  if(name==='teacher-assignments'){
   await page.evaluate(()=>{for(const el of document.querySelectorAll('button'))if(el.textContent.trim()==='Alex Sample'){el.click();break;}});
   await page.waitForSelector('#comment',{visible:true});
  }
  // Keep all sample screenshots visibly identified even when copied out of a manual.
  await page.evaluate(()=>{const el=document.createElement('div');el.textContent='USER GUIDE • FICTIONAL SAMPLE DATA';Object.assign(el.style,{position:'fixed',bottom:'10px',right:'14px',padding:'7px 12px',background:'#173d32',color:'#fff',font:'bold 11px Arial',borderRadius:'4px',zIndex:'2147483647'});document.body.append(el);});
  await page.screenshot({path:out+name+'.png',fullPage:false});
  const final=new URL(page.url());
  const entry={name,route,finalPath:final.pathname,finalSearch:final.search,errors};
  const existing=report.findIndex(r=>r.name===name);
  if(existing>=0)report[existing]=entry;else report.push(entry);
  console.log(name,errors.length?'ERROR '+errors.join('; '):'captured');
  await context.close();
 }
 await writeFile(out+'capture-report.json',JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close();}
