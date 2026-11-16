// Documentation fixtures and pure-function expectations only. No server, DB or AI calls.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import * as matcher from '../backend/teacherMatching.js';
import {computeProficiencyLevel,LEVEL_EVALUATION_CRITERIA} from '../backend/proficiencyEvaluation.js';
import {STUDENT_CRITERIA_OPTIONS,TEACHER_CRITERIA_OPTIONS} from '../frontend/src/utils/matchingCriteria.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'alpha-testing-ai-matching');await mkdir(out,{recursive:true});
const courseNames=['Conversational English','Online English','Business English','IELTS','News','Travel English','Job Interview','TOEIC','OPIc'];
const courses=courseNames.map((course_name,i)=>({course_id:i+1,course_name}));
const courseId=name=>courses.find(c=>c.course_name===name).course_id;
const definitions=[
 ['Jamie','speaking and conversation','conversational','slow',6,['Conversational English','Online English','Travel English']],
 ['Taylor','grammar and writing','structured','fast',2,['Online English','IELTS','Business English']],
 ['Alex','listening and pronunciation','visual','balanced',5,['Conversational English','Online English','Travel English','IELTS']],
 ['Sam','news discussion, speaking and conversation','interactive','balanced',7,['News','Conversational English']],
 ['Morgan','business english, job interview coaching, grammar and writing','structured','fast',8,['Business English','Job Interview','Online English','TOEIC']],
 ['Casey','speaking and conversation','interactive','fast',4,['Conversational English','Travel English','Online English']],
 ['Riley','grammar and writing, speaking and conversation','structured','review-heavy',3,['Online English','Conversational English']],
 ['Jordan','reading and vocabulary, exam preparation','independent','balanced',7,['IELTS','TOEIC','News','Online English']],
];
const teachers=definitions.map(([first_name,specialization,style,pace,experience_years,courseNames],i)=>({
 fixtureId:`T${String(i+1).padStart(2,'0')}`,user_id:901+i,first_name,last_name:'Demo',email:`alpha.teacher${i+1}@example.com`,country:'Philippines',birth_date:'1990-06-15',role:'teacher',status:'active',profile_completed:1,
 specialization,teachingStyle:[style],idealStudentPace:[pace],experience_years,teaches_children:1,
 bio:`English language educator.\n\nAI matching profile:\nTeaching style: ${style}\nBest student pace: ${pace}`,
 assigned_student_count:0,courseNames,
}));
const studentDefs=[
 ['Lea','Conversational English',[2,1,2,1,2],['conversation'],['speaking'],['conversational'],['slow'],'Uses short phrases and needs guided everyday speaking practice.'],
 ['Noah','Online English',[2,2,2,2,2],['confidence'],['grammar'],['structured'],['review-heavy'],'Wants clearer sentences and confidence through structured grammar review.'],
 ['Mia','Business English',[5,5,4,5,4],['business'],['writing'],['structured'],['fast'],'An experienced professional improving concise business writing.'],
 ['Ethan','Conversational English',[3,3,3,3,3],['conversation'],['speaking'],['interactive'],['fast'],'Wants active speaking practice through fast-paced activities.'],
 ['Zoe','IELTS',[4,4,3,4,3],['exam-prep'],['reading'],['independent'],['balanced'],'Preparing for IELTS with independent reading practice.'],
 ['Ava','Online English',[4,4,3,4,3],['confidence'],['pronunciation'],['visual'],['balanced'],'Needs visual pronunciation support while building confidence.'],
 ['Liam','Conversational English',[3,3,3,3,3],['conversation'],['speaking'],['conversational','interactive'],['slow','balanced','fast'],'Can learn through several styles and paces.'],
 ['Isla','Business English',[5,5,4,5,4],['business'],['vocabulary'],['visual'],['slow'],'Wants slow visual vocabulary work for business; the available business pool has limited fit.'],
];
const students=studentDefs.map(([firstName,courseName,values,learningGoal,focusArea,learningStyle,pace,assessment],i)=>{
 const levelScores=Object.fromEntries(LEVEL_EVALUATION_CRITERIA.map((c,n)=>[c.key,values[n]]));
 return {fixtureId:`S${String(i+1).padStart(2,'0')}`,firstName,lastName:'Demo',email:`alpha.student${i+1}@example.com`,country:'Philippines',birthDate:'2000-01-15',courseName,levelScores,computedLevel:computeProficiencyLevel(levelScores),aiCriteria:{learningGoal,focusArea,learningStyle,pace},assessment,trialNotes:''};
});
const cases=[];
const titles=['Novice conversation and slow pace','Intermediate grammar and structured lessons','Advanced business writing','Interactive speaking','IELTS reading and independent learning','Visual pronunciation with partial fit','Several suitable teachers','No close preference match'];
function derive(def){
 const student=structuredClone(students.find(s=>s.fixtureId===def.student));
 if(def.criteria)student.aiCriteria=def.criteria;
 if(def.scores){student.levelScores=Object.fromEntries(LEVEL_EVALUATION_CRITERIA.map((c,i)=>[c.key,def.scores[i]]));student.computedLevel=computeProficiencyLevel(student.levelScores);}
 if(def.courseName)student.courseName=def.courseName;
 const pool=teachers.filter(t=>(!def.pool||def.pool.includes(t.fixtureId))&&t.courseNames.includes(student.courseName)).map(t=>({...t,selected_course_match:1,assigned_student_count:def.loads?.[t.fixtureId]??t.assigned_student_count,teaches_children:def.childOptOut?.includes(t.fixtureId)?0:t.teaches_children}));
 let ranked=matcher.rankTeachers(pool.map(t=>matcher.scoreTeacherForStudent(t,student.aiCriteria,'',courseId(student.courseName),student.computedLevel.level)));
 let availability=null;
 if(def.available){availability=new Map(ranked.map(t=>[String(t.user_id),{evaluated:true,available:def.available.includes(t.fixtureId)}]));ranked=matcher.preferAvailable(ranked,availability);}
 ranked=matcher.preferTeachesChildren(ranked,!!def.child);
 const preferred=def.preferred?teachers.find(t=>t.fixtureId===def.preferred).user_id:null;
 const pick=matcher.selectTeacherFromRanking(ranked,preferred,{honourPreferred:!!def.preferred});
 const selected=pick.assigned;
 return {...def,studentInput:student,pool:pool.map(t=>t.fixtureId),expected:selected?{teacher:selected.fixtureId,name:selected.first_name+' '+selected.last_name,score:selected.score,strength:matcher.assessMatchStrength(selected),leastLoadedFallback:pick.usedLeastLoadedFallback,preferredHonouredOverLimit:pick.preferredHonouredOverLimit,childConflict:!!def.child&&!matcher.teacherWillTeachChildren(selected)}:{teacher:null,noTeacherReason:'no-teacher-for-course'},ranking:ranked.map(t=>({teacher:t.fixtureId,name:t.first_name+' '+t.last_name,score:t.score,load:t.assigned_student_count,criterionMatches:t.criterionMatches,reasons:t.reasons})),executionStatus:'Not run'};
}
for(let i=0;i<8;i++)cases.push(derive({id:`TC${String(i+1).padStart(2,'0')}`,title:titles[i],student:students[i].fixtureId,mode:'rules-only',purpose:titles[i]}));
const empty={learningGoal:[],focusArea:['grammar'],learningStyle:[],pace:[]};
for(const def of [
 {id:'TC09',title:'Proficiency isolation: Novice',student:'S01',courseName:'Online English',pool:['T01','T02'],criteria:empty,scores:[2,1,2,1,2],purpose:'Hold course, teachers and grammar focus fixed; isolate proficiency. Compare with TC10.'},
 {id:'TC10',title:'Proficiency isolation: Advanced',student:'S01',courseName:'Online English',pool:['T01','T02'],criteria:empty,scores:[5,5,4,5,4],purpose:'Only rubric scores change from TC09. The scorer rewards sufficient experience; the selected teacher can have weaker focus coverage.'},
 {id:'TC11',title:'Workload preference',student:'S01',pool:['T01','T06'],loads:{T01:2,T06:0},purpose:'A better-fit teacher reaches the load target; automatic selection prefers an under-target alternative.'},
 {id:'TC12',title:'No teachers for selected course',student:'S01',courseName:'OPIc',purpose:'No sample teacher is assigned to OPIc; expect specific course feedback and no invented teacher.'},
 {id:'TC13',title:'Availability preference',student:'S01',pool:['T01','T06'],available:['T06'],purpose:'Use a facilitator-specified upcoming Monday morning, duration 25 minutes: Jamie unavailable, Casey available 08:00–10:00, no bookings or breaks. Other dates have no availability. Casey is moved first.'},
 {id:'TC14',title:'Child-teaching preference',student:'S01',pool:['T01','T06'],child:true,childOptOut:['T01'],purpose:'Use an age-10 birth date supplied by facilitator. Jamie opted out of children; Casey accepts children. Observe prioritization and any warnings.'},
 {id:'TC15',title:'All teachers reach the load target',student:'S01',pool:['T01','T06'],loads:{T01:4,T06:2},purpose:'Everyone has at least two assigned students; expect least-loaded fallback, not refusal.'},
 {id:'TC16',title:'Explicit administrator selection over load target',student:'S01',pool:['T01','T06'],loads:{T01:0,T06:3},preferred:'T06',purpose:'Select Casey explicitly before analyzing. The route honors the manual choice over the load target and warns.'},
])cases.push(derive({...def,mode:'rules-only'}));
for(const c of cases){
 for(const [field,values] of Object.entries(c.studentInput.aiCriteria)){
  const allowed=new Set(STUDENT_CRITERIA_OPTIONS[field].filter(o=>!o[2]||o[2].includes(c.studentInput.courseName)).map(o=>o[0]));
  if(values.some(v=>!allowed.has(v)))throw Error(`${c.id}: unsupported ${field}`);
 }
}
for(const t of teachers){
 for(const spec of t.specialization.split(', '))if(!TEACHER_CRITERIA_OPTIONS.specialization.some(o=>o[0]===spec&&o[2].some(c=>t.courseNames.includes(c))))throw Error('Bad specialization '+t.fixtureId);
}
// Reproduce the advisor data contract using the actual pure function source.
const advisorSource=await readFile(path.join(root,'backend/teacherAdvisor.js'),'utf8');
const match=advisorSource.match(/function describeCandidates\(scored, availability\) \{[\s\S]*?\n\}/);
if(!match)throw Error('describeCandidates not found');
const describe=vm.runInNewContext('('+match[0]+')',{MAX_BIO_CHARS:400});
const scored=matcher.scoreTeacherForStudent({...teachers[0],selected_course_match:1},students[0].aiCriteria,'',1,'novice-low');
const received=describe([scored],null)[0];
const audit={scorerProvidesNestedProfile:!!scored.profile,advisorReceives:received,expectedFromTeacher:{specialization:teachers[0].specialization,teachingStyle:teachers[0].teachingStyle,bestStudentPace:teachers[0].idealStudentPace,experienceYears:teachers[0].experience_years},scope:'Pure local data-contract reproduction, not a deployed AI execution.'};
const files=['backend/teacherMatching.js','backend/teacherAdvisor.js','backend/matchInsights.js','backend/proficiencyEvaluation.js','backend/server.js','backend/Database.sql','frontend/src/pages/AdminDashboard.jsx','frontend/src/utils/matchingCriteria.js','frontend/src/utils/proficiencyEvaluation.js'];
const sourceIndex={};
for(const f of files){const lines=(await readFile(path.join(root,f),'utf8')).split('\n');sourceIndex[f]=lines.map((s,i)=>({line:i+1,text:s.trim()})).filter(x=>/^(export )?(async )?function (scoreTeacherForStudent|rankTeachers|assessMatchStrength|selectTeacherFromRanking|preferAvailable|preferTeachesChildren|evaluateAvailability|recommendTeacher|deriveMatchInsights|computeProficiencyLevel|buildTeacherAiBio|buildCriteriaNotes|buildPrompt|describeCandidates|adviseTeacherRanking)|app.post\("\/api\/admin\/(recommend-teacher|users)"|async function (analyzeStudentMatch|createStudent)/.test(x.text));}
const manualCases=[
 {id:'TC17',title:'Live AI ranking',student:'S01',mode:'live AI',executionStatus:'Not run',expected:'Course-eligible teacher with profile-supported explanation; advisor.used true. No exact ranking requirement. Known adapter gap must not waive acceptance.'},
 {id:'TC18',title:'AI interpretation of trial notes',student:'S01',mode:'live AI insights',executionStatus:'Not run',expected:'At least one supported allowed criterion inferred from the supplied everyday-speaking / conversational / guided-pace note; record inference and ranking status separately.'},
 {id:'TC19',title:'Select, save and reopen the assigned teacher',student:'S01',mode:'authorized non-production persistence',executionStatus:'Not run',expected:'Final selected teacher, recomputed proficiency and course are persisted; criteria and rubric scores appear in stored notes. Coordinator supplies a unique disposable email.'}
];
const result={date:'17 November 2026',scope:'Documentation and fictional data only. No records inserted; all QA case statuses Not run. Pure-function expectations are reference calculations, not live QA results.',courses,teachers,students,cases,manualCases,advisorContractAudit:audit,sourceIndex,options:{student:STUDENT_CRITERIA_OPTIONS,teacher:TEACHER_CRITERIA_OPTIONS},scoreWeights:matcher.SCORE_WEIGHTS,levelExperience:matcher.MIN_EXPERIENCE_BY_LEVEL,levelRubric:LEVEL_EVALUATION_CRITERIA};
await writeFile(path.join(out,'sample-data-and-expected-results.json'),JSON.stringify(result,null,2));
for(const c of cases)console.log(c.id,c.expected.name||c.expected.noTeacherReason,c.expected.score??'',c.expected.strength?.level||'');
console.log('Advisor contract:',JSON.stringify(audit));
