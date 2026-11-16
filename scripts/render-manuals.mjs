// Print role HTML to PDF; validate references and inspect every PDF page with PDF.js.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir,unlink,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'docs/user-manuals');
const qa=path.join(dir,'qa');
await mkdir(qa,{recursive:true});
// Remove only this script's old generated contact sheets, never source illustrations.
for(const name of await readdir(qa))if(/^(VISITOR|STUDENT|TEACHER|ADMIN|SUPER_ADMIN|USER).*?-sheet-\d+\.png$/.test(name))await unlink(path.join(qa,name));
const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
const server=createServer(async(req,res)=>{
 try{
  let target=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(target==='/__pdf-review'){
   res.setHeader('Content-Type','text/html');
   res.end('<!doctype html><html><body style="margin:0;background:#e6ebe7"><script type="module">import * as pdfjs from "/frontend/node_modules/pdfjs-dist/build/pdf.mjs";pdfjs.GlobalWorkerOptions.workerSrc="/frontend/node_modules/pdfjs-dist/build/pdf.worker.mjs";window.pdfjs=pdfjs;</script></body></html>');return;
  }
  const file=path.resolve(root,'.'+target);
  if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
  const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.png':'image/png','.pdf':'application/pdf','.json':'application/json'};
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Not found');}
});
let browser;
const reports=[];
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();await page.setViewport({width:1080,height:1500});
 const targets=[...manifest.map(m=>({file:'docs/user-manuals/'+m.file,role:m.role})),{file:'USER_MANUAL',role:'Manual directory'},{file:'ADMIN_USER_MANUAL',role:'Administrator'}];
 for(const {file,role} of targets){
  await page.goto(base+'/'+file+'.html',{waitUntil:'networkidle0'});
  const validation=await page.evaluate(async()=>{
   await document.fonts.ready;
   const brokenImages=[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src);
   const ids=new Set([...document.querySelectorAll('[id]')].map(n=>n.id));
   const brokenAnchors=[...document.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href')).filter(h=>!ids.has(h.slice(1)));
   const badLinks=[];
   for(const a of document.querySelectorAll('a[href]:not([href^="#"])')){const u=new URL(a.href);if(u.pathname.endsWith('.pdf'))continue;const r=await fetch(u);if(!r.ok)badLinks.push(a.href);}
   return {brokenImages,brokenAnchors,badLinks,chapters:document.querySelectorAll('.section').length,words:document.querySelector('main').innerText.split(/\s+/).length};
  });
  if(validation.brokenImages.length||validation.brokenAnchors.length||validation.badLinks.length)throw Error(JSON.stringify({file,validation}));
  await page.pdf({path:path.join(root,file+'.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:`<div style="width:100%;padding:0 17mm;font:8px Arial;color:#66796c;display:flex;justify-content:space-between"><span>JEN ACADEMIA · ${role.toUpperCase()} USER GUIDE</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`});
  reports.push({file,role,...validation});console.log('Printed',file,validation.words,'words');
 }
 for(const {file} of targets){
  await page.goto(base+'/'+file+'.html',{waitUntil:'domcontentloaded'});
  const pdfLinks=await page.$$eval('a[href$=".pdf"]',as=>as.map(a=>new URL(a.href).pathname));
  for(const link of pdfLinks)if(!(await stat(path.resolve(root,'.'+decodeURIComponent(link)))).size)throw Error('Empty PDF '+link);
 }
 // Read every rendered page, identify sparse overflow pages, and create visual contact sheets.
 await page.goto(base+'/__pdf-review',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>!!window.pdfjs);
 for(const report of reports){
  report.pages=await page.evaluate(async(encoded)=>{
   const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
   window.pdfDocument=await pdfjs.getDocument({data:bytes}).promise;
   const pages=[];
   for(let i=1;i<=pdfDocument.numPages;i++){
    const p=await pdfDocument.getPage(i);const t=await p.getTextContent();
    const str=t.items.map(x=>x.str).join(' ');
    pages.push({number:i,characters:str.length,preview:str.slice(0,130),tail:str.slice(-160)});
   }
   return pages;
  },(await readFile(path.join(root,report.file+'.pdf'))).toString('base64')).catch(e=>{throw Error(report.file+': '+e.message);});
  const stem=path.basename(report.file);
  if(report.file.startsWith('docs/')){
   const data=await page.evaluate(async(number)=>{
    const p=await pdfDocument.getPage(number);const vp=p.getViewport({scale:1.4});
    const canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;
    await p.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    return canvas.toDataURL('image/png').split(',')[1];
   },Math.min(stem==='TEACHER_USER_MANUAL'?13:6,report.pages.length));
   await writeFile(path.join(qa,stem+'-sample.png'),Buffer.from(data,'base64'));
  }
  for(let start=1;start<=report.pages.length;start+=8){
   await page.setViewport({width:1440,height:1080,deviceScaleFactor:1});
   const data=await page.evaluate(async({start,title})=>{
    document.querySelectorAll('canvas,h3').forEach(el=>el.remove());
    const sheet=document.createElement('canvas');sheet.width=1440;sheet.height=1080;
    const ctx=sheet.getContext('2d');ctx.fillStyle='#e6ebe7';ctx.fillRect(0,0,1440,1080);
    for(let j=0;j<8 && start+j<=pdfDocument.numPages;j++){
     const p=await pdfDocument.getPage(start+j);const vp=p.getViewport({scale:.55});
     const canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;
     await p.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
     const x=18+(j%4)*356,y=50+Math.floor(j/4)*520;
     ctx.fillStyle='#fff';ctx.fillRect(x,y,330,467);ctx.drawImage(canvas,x,y,330,467);
     // Larger second copy improves readability at contact-sheet scale.
     ctx.fillStyle='#294e39';ctx.font='bold 15px Arial';ctx.fillText('Page '+(start+j),x,y-10);
    }
    ctx.fillStyle='#173e30';ctx.font='bold 18px Arial';ctx.fillText(title,18,24);
    return sheet.toDataURL('image/png').split(',')[1];
   },{start,title:report.role+' — pages '+start+'–'+Math.min(start+7,report.pages.length)});
   await writeFile(path.join(qa,stem+'-sheet-'+start+'.png'),Buffer.from(data,'base64'));
  }
  console.log(stem,report.pages.length,'pages;',report.pages.filter(p=>p.characters<250).map(p=>'sparse '+p.number).join(', '));
 }
 await writeFile(path.join(qa,'validation.json'),JSON.stringify(reports,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
