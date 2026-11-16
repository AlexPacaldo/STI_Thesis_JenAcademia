"""Four editable alpha documents; questionnaire intentionally excluded.
Preset standard_business_brief; memo_masthead. Named overrides: TableCompact
9pt/single/2pt after; Caption 9pt; title 26pt; explicit-page heading 0pt before.
"""
import html
import json
import sys
from pathlib import Path
from zipfile import ZipFile
from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches,Pt,RGBColor

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'alpha-testing-ai-matching'
SKILL=Path('C:/Users/Carding Garcia/.codex/plugins/cache/openai-primary-runtime/documents/26.518.11428/skills/documents')
sys.path.insert(0,str(SKILL/'scripts'))
from table_geometry import apply_table_geometry,audit_docx_tables
D=json.loads((OUT/'sample-data-and-expected-results.json').read_text(encoding='utf-8'))
T={t['fixtureId']:t for t in D['teachers']};S={s['fixtureId']:s for s in D['students']}
def tname(t):return t['first_name']+' '+t['last_name']
def sname(s):return s['firstName']+' '+s['lastName']
def labels(field,values):
    cat={x[0]:x[1] for x in D['options']['student'][field]}
    return ', '.join(cat[v] for v in values) or 'None selected'
def inputs(s):
    return [(field,labels(key,s['aiCriteria'][key])) for field,key in [('Learning Goal','learningGoal'),('Focus Area','focusArea'),('Learning Style','learningStyle'),('Learning Pace','pace')]]
def scores(s):return ', '.join(str(s['levelScores'][c['key']]) for c in D['levelRubric'])
def level(s):
    return {'novice-low':'Novice','intermediate-low':'Intermediate Low','intermediate-mid':'Intermediate Mid','intermediate-high':'Intermediate High','advanced':'Advanced'}[s['computedLevel']['level']]

class Report:
    def __init__(self,stem,title,subtitle):
        self.stem=stem;self.d=Document();self.hparts=[]
        sec=self.d.sections[0];sec.page_width=Inches(8.5);sec.page_height=Inches(11)
        sec.top_margin=sec.bottom_margin=sec.left_margin=sec.right_margin=Inches(1)
        sec.header_distance=sec.footer_distance=Inches(.492)
        for name,size,color,bef,aft,line in [('Normal',11,'21382F',0,6,1.1),('Title',26,'0B2545',0,12,1.1),('Subtitle',12,'555555',0,10,1.1),('Heading 1',16,'2E74B5',16,8,1.1),('Heading 2',13,'2E74B5',12,6,1.1),('Heading 3',12,'1F4D78',8,4,1.1),('Caption',9,'555555',4,4,1),('Header',8,'555555',0,0,1),('Footer',8,'555555',0,0,1)]:
            st=self.d.styles[name];st.font.name='Calibri';st.font.size=Pt(size);st.font.color.rgb=RGBColor.from_string(color)
            pf=st.paragraph_format;pf.space_before=Pt(bef);pf.space_after=Pt(aft);pf.line_spacing=line;pf.widow_control=True
            if name.startswith('Heading'):st.font.bold=True;pf.keep_with_next=True
        st=self.d.styles.add_style('TableCompact',WD_STYLE_TYPE.PARAGRAPH);st.base_style=self.d.styles['Normal'];st.font.size=Pt(9);st.paragraph_format.line_spacing=1;st.paragraph_format.space_before=Pt(0);st.paragraph_format.space_after=Pt(2)
        st=self.d.styles.add_style('Procedure',WD_STYLE_TYPE.PARAGRAPH);st.base_style=self.d.styles['Normal'];st.paragraph_format.space_after=Pt(8);st.paragraph_format.line_spacing=1.167
        self.d.styles['Title'].font.bold=True
        sec.header.paragraphs[0].text='JEN ACADEMIA | ALPHA TESTING | AI TEACHER MATCHING'
        sec.footer.paragraphs[0].text='17 November 2026 | Documentation only                                  '
        f=OxmlElement('w:fldSimple');f.set(qn('w:instr'),'PAGE');sec.footer.paragraphs[0]._p.append(f)
        self.d.core_properties.title=title;self.d.core_properties.author='JEN Academia'
        self.p(title,'Title');self.p(subtitle,'Subtitle')
    def p(self,text,sty=None):
        self.d.add_paragraph(str(text),sty);self.hparts.append('<p>'+html.escape(str(text))+'</p>')
    def h(self,text,new=False,minor=False):
        q=self.d.add_paragraph(text,'Heading 2' if minor else 'Heading 1')
        if new:q.paragraph_format.page_break_before=True;q.paragraph_format.space_before=Pt(0)
        self.hparts.append('<h2>'+html.escape(text)+'</h2>')
    def table(self,heads,rows,widths):
        t=self.d.add_table(rows=1,cols=len(heads));t.style='Table Grid'
        for c,v in zip(t.rows[0].cells,heads):c.text=str(v)
        t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
        for row in rows:
            for c,v in zip(t.add_row().cells,row):c.text=str(v)
        for i,row in enumerate(t.rows):
            row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
            for c in row.cells:
                for q in c.paragraphs:
                    q.style=self.d.styles['TableCompact']
                    for run in q.runs:run.bold=i==0
                if i==0:
                    sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'F2F4F7');c._tc.get_or_add_tcPr().append(sh)
        apply_table_geometry(t,widths,table_width_dxa=9360,indent_dxa=120)
        self.hparts.append('<table><tr>'+''.join('<th>'+html.escape(str(x))+'</th>' for x in heads)+'</tr>'+''.join('<tr>'+''.join('<td>'+html.escape(str(x))+'</td>' for x in row)+'</tr>' for row in rows)+'</table>')
    def steps(self,items):
        root=self.d.part.numbering_part.element
        aid=max([int(x.get(qn('w:abstractNumId'))) for x in root.findall(qn('w:abstractNum'))],default=-1)+1
        a=OxmlElement('w:abstractNum');a.set(qn('w:abstractNumId'),str(aid));l=OxmlElement('w:lvl');l.set(qn('w:ilvl'),'0')
        for tag,val in [('start','1'),('numFmt','decimal'),('lvlText','%1.'),('lvlJc','left')]:
            e=OxmlElement('w:'+tag);e.set(qn('w:val'),val);l.append(e)
        pp=OxmlElement('w:pPr');ind=OxmlElement('w:ind');ind.set(qn('w:left'),'720');ind.set(qn('w:hanging'),'360');pp.append(ind);l.append(pp);a.append(l);root.append(a)
        nid=max([int(x.get(qn('w:numId'))) for x in root.findall(qn('w:num'))],default=0)+1
        n=OxmlElement('w:num');n.set(qn('w:numId'),str(nid));e=OxmlElement('w:abstractNumId');e.set(qn('w:val'),str(aid));n.append(e);root.append(n)
        for text in items:
            q=self.d.add_paragraph(text,'Procedure');np=OxmlElement('w:numPr')
            for tag,val in [('ilvl','0'),('numId',str(nid))]:e=OxmlElement('w:'+tag);e.set(qn('w:val'),val);np.append(e)
            q._p.get_or_add_pPr().append(np)
        self.hparts.append('<ol>'+''.join('<li>'+html.escape(x)+'</li>' for x in items)+'</ol>')
    def save(self):
        target=OUT/(self.stem+'.docx');self.d.save(target)
        assert audit_docx_tables(target)==0
        with ZipFile(target) as z:assert z.testzip() is None
        page='<!doctype html><html><head><meta charset="utf-8"><title>'+html.escape(self.d.core_properties.title)+'</title><style>body{max-width:980px;margin:40px auto;padding:0 20px;font:16px/1.55 Arial;color:#21382f}h2{color:#173d32}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #cbd5cd;padding:8px;text-align:left;vertical-align:top}th{background:#f2f4f7}li{margin-bottom:8px}</style></head><body><p><a href="index.html">Package contents</a> | <a href="'+self.stem+'.docx">Editable Word document</a></p>'+''.join(self.hparts)+'</body></html>'
        (OUT/(self.stem+'.html')).write_text(page,encoding='utf-8')
        return {'file':target.name,'title':self.d.core_properties.title,'tables':len(self.d.tables),'paragraphs':len(self.d.paragraphs),'structuralCheck':'pass','visualRendering':'pending'}

reports=[]
r=Report('01_Alpha_Tester_Guide','Alpha Tester Guide','For three external QA testers | Deployed-site walkthrough')
r.p('Use the authorized administrator test account supplied by the coordinator. Work on the approved deployed alpha site, with the prepared non-production dataset. No live account or database provisioning has been performed by this documentation package.')
r.h('Before the session')
r.table(['Coordinator supplies','Required detail'],[['Site and build','Approved deployed alpha URL, version/build and session time.'],['Access for QA01, QA02 and QA03','Separate authorized administrator credentials, supplied privately.'],['Prepared sample records','Eight teachers and eight assessment profiles in Document 2; actual course/teacher IDs mapped by name.'],['Mode and reset','A rules-only baseline session, a live AI session, and the specified isolated data variants.'],['Assignment check','A disposable student email and permission to save in the non-production environment; no real email recipients.']],[3100,6260])
r.p('If the site, credentials or sample data are missing, mark the affected case Blocked and contact the coordinator. Do not assume a sample account exists because it is listed in a document.')
r.h('How the four documents fit together')
r.p('Read this guide first. Use Sample Student and Teacher Profiles to enter exact values. Use AI Matching Test Cases to compare expected and actual outcomes. Refer to Matching Algorithm Explanation for source-level details and known limitations.')
r.h('Known limitation to watch')
r.p('The current AI advisor reads teacher attributes from a nested profile object that the recommendation route does not provide. A local contract check shows empty teacher specializations, styles and paces reaching that adapter. Proficiency is used in rules scoring but is not explicitly included in the advisor prompt. Do not interpret a successful AI request as proof of correct fit.')
r.h('Run a matching case',True)
r.steps(['Sign in to the deployed alpha site with your assigned administrator account. Open Create Student.','Start on a fresh page and leave Assigned Teacher at Select Teacher. A previous explicit choice can override a later automatic recommendation.','Use the case’s course, adult birthday, and five Level Evaluation scores. Confirm the computed proficiency label before analyzing.','Select the exact Learning Goal, Focus Area, Learning Style and Learning Pace chips from Document 2 or the case override. Unless the case says otherwise, leave Trial Class Notes and Preferred Class Time blank.','Click Analyze with AI once and wait. Read the recommended teacher, strength/coverage, explanation, active-student count and warnings.','Identify the mode. If the page says AI is unavailable/not configured, this is fallback. Ask the coordinator to confirm advisor.used for a live ranking run when needed; note inference has its own status.','Save input and result screenshots. Compare with the expected outcome for that case and mode. Record the actual result and verdict in your own copy of Document 3.','Do not click Create Student for preview cases. Use TC19 only for the authorized saved-assignment check.'])
r.h('Read the expected result correctly')
r.p('Exact rule-based names and scores assume the stated candidate pool, loads, notes and level. A different live pool requires review. Coverage counts four preference categories; proficiency is a separate experience-based score contribution, not a fifth coverage category. Scores are not confidence percentages.')
r.h('Working independently as three testers',True)
r.p('QA01, QA02 and QA03 each receive a separate copy of the test-case document. All three run TC01–TC10 independently after the coordinator confirms the same starting snapshot. Run TC11–TC16 variants in scheduled slots, and TC17–TC19 in the assigned AI/save sessions. Do not change shared teacher records or create load-building students yourself.')
r.steps(['Record your tester code, build, local date/time/timezone and dataset version for every case.','Use screenshots named QA01-TC01-input.png and QA01-TC01-result.png; replace the tester/case codes as needed. Preserve original captures.','If something differs, record the actual teacher, coverage, explanation and mode. Log the smallest reproducible steps and any error message.','Use Pass only when the case’s acceptance condition is met. Use Fail for a reproducible mismatch; use Blocked for missing setup, access or required AI availability. Leave unexecuted cases Not run.','Compare results together only after independent runs. Ask the coordinator to reset data after workload, availability, child-suitability or save cases. Sign out when finished.'])
r.h('When changing criteria should change the outcome')
r.p('Compare TC01 with TC04 for different style/pace needs, and TC09 with TC10 for a proficiency-only change. Not every change must produce a different teacher: compare the changed score, coverage or explanation as well. A pinned Assigned Teacher can mask the effect, so always use a fresh form.')
r.h('Selecting and assigning a teacher')
r.p('The recommendation fills Assigned Teacher. You may choose a different course-eligible teacher. Saving requires all five level scores plus required identity/contact and package inputs. TC19 checks Create Student, any confirmation dialog, and reopening the saved record. Analyze alone does not persist an assignment or reserve a lesson.')
reports.append(r.save())

r=Report('02_Sample_Student_and_Teacher_Profiles','Sample Student and Teacher Profiles','Fictional documentation fixtures | No accounts inserted')
r.p('These are proposed alpha records for coordinator preparation in an authorized non-production environment. Reference IDs such as T01 and S01 are document labels, not new database columns. Numeric IDs in the JSON are fixture IDs; map actual deployed IDs by confirmed account/course names.')
r.h('Baseline conditions')
r.p('All eight teachers are active and have zero assigned active, profile-complete students. All accept children unless a case explicitly changes that condition. No preferred schedule is supplied in the baseline. Teacher free text is exactly “English language educator.” before the structured profile block; this avoids unplanned keyword bonuses.')
r.p('Teacher metadata: country Philippines; birthday 1990-06-15; role teacher. Student metadata: country Philippines; birthday 2000-01-15, so all baseline learners are adults. Emails ending in example.com are fictional identifiers, not usable credentials or inboxes. Use coordinator-provided unique disposable addresses for a save test.')
r.h('Exact accepted assessment format')
r.p('Enter integer scores from 1 to 5 in this order: Speaking & Pronunciation, Reading & Comprehension, Structure, Sentence / Grammar, Vocabulary. The application computes the level; do not manually choose a proficiency label.')
r.table(['UI field','Request / storage behavior'],[['Level Evaluation','levelScores map; computed proficiency_level on save.'],['Learning Goal / Focus Area','criteria.learningGoal / criteria.focusArea arrays during Analyze.'],['Learning Style / Learning Pace','criteria.learningStyle / criteria.pace arrays during Analyze.'],['Saved criteria and scores','Appended to student_profiles.trial_notes, not separate matching-criteria columns.'],['Teacher attributes','specialization and experience_years columns; style/pace tags inside teacher_profiles.bio.']],[3000,6360])
r.h('Sample teacher account overview',True)
r.table(['Reference / name','Sample email','Main specialization','Experience'],[[t['fixtureId']+' / '+tname(t),t['email'],t['specialization'],str(t['experience_years'])+' years'] for t in D['teachers']],[2100,2500,3260,1500])
r.p('These fictional account identifiers are reference data, not supplied login credentials. Use the administrator login provided privately by the coordinator. The detailed profiles on the following pages give each teacher’s course eligibility, style and pace.')
for offset in [0,4]:
    r.h('Teacher profiles '+str(offset+1)+'–'+str(offset+4),True)
    for t in D['teachers'][offset:offset+4]:
        r.h(t['fixtureId']+' | '+tname(t),minor=True)
        r.p('Sample email: '+t['email']+' | Experience Years: '+str(t['experience_years'])+' | Active students: 0 | Teaches children: Yes')
        r.p('Courses This Teacher Can Teach: '+', '.join(t['courseNames'])+'.')
        r.p('Specialization (stored values): '+t['specialization']+'.')
        stylecat={x[0]:x[1] for x in D['options']['teacher']['teachingStyle']};pacecat={x[0]:x[1] for x in D['options']['teacher']['idealStudentPace']}
        r.p('Teaching Style: '+stylecat[t['teachingStyle'][0]]+' ['+t['teachingStyle'][0]+']; Best Student Pace: '+pacecat[t['idealStudentPace'][0]]+' ['+t['idealStudentPace'][0]+'].')
for offset in [0,4]:
    r.h('Student assessment profiles '+str(offset+1)+'–'+str(offset+4),True)
    for s in D['students'][offset:offset+4]:
        r.h(s['fixtureId']+' | '+sname(s),minor=True)
        r.p(s['assessment'])
        r.p('Course: '+s['courseName']+' | Rubric scores: '+scores(s)+' | Computed: '+level(s)+' ['+s['computedLevel']['level']+'].')
        r.p(' | '.join(k+': '+v for k,v in inputs(s)))
        r.p('Sample email: '+s['email']+'. Trial Class Notes: blank in deterministic cases. The assessment sentence above is background; do not paste it unless the case asks for notes.')
r.h('Allowed options and exact labels',True)
for field in ['learningGoal','focusArea','learningStyle','pace']:
    r.h(field,minor=True)
    r.p('; '.join(label+' ['+value+']'+(' — '+', '.join(courses) if courses else '') for value,label,*rest in D['options']['student'][field] for courses in [rest[0] if rest else []]))
r.p('The administrator form uses the labels above. Student-facing screens may use aliases such as Visual Learning, Guided Pace or Accelerated Pace for the same stored values. Pick course-available chips; do not use Others for the baseline.')
r.h('Coordinator preparation notes',minor=True)
r.p('Prepare records separately; this package supplies no database insertion script. Specialization chips are limited by the union of teacher courses. Exact specializations must fit teacher_profiles.specialization; the current write path clamps its comma-joined text to 255 characters. Do not add degrees, certificates, teacher-proficiency fields or separate style/pace columns that the matching path does not read.')
reports.append(r.save())

r=Report('03_AI_Matching_Test_Cases','AI Matching Test Cases','19 cases | Blank actual results | Independent copies for QA01, QA02 and QA03')
r.p('All cases start Not run. Exact predictions below are pure-function reference calculations from the current code, not deployed execution results. Each tester completes a separate copy. The questionnaire is omitted.')
r.p('Tester code: __________________  Deployed site / build: __________________  Date / timezone: __________________')
r.h('Common baseline')
r.p('Use Document 2’s prepared data, a fresh Create Student page and blank Assigned Teacher. Enter all five rubric scores. Leave notes, preferred time and custom values blank unless the case says otherwise. Confirm rules-only mode for TC01–TC16; no case requires a production write.')
r.table(['Case range','Coverage'],[['TC01–TC08','Novice conversation, grammar, advanced business, interactive/independent learning, slow pace, multiple fits and weak fit.'],['TC09–TC10','Proficiency-only comparison with an isolated two-teacher pool.'],['TC11–TC16','Load preference, empty course pool, availability, children, least-loaded fallback and manual choice.'],['TC17–TC19','Live AI ranking, AI note interpretation and saved assignment.']],[2500,6860])
for c in D['cases']:
    s=c['studentInput'];expected=c['expected']
    r.h(c['id']+' | '+c['title'],True)
    r.p('Mode: rules-only | Student reference: '+c['student']+' / '+sname(s)+' | Starting verdict: Not run')
    r.p('Purpose: '+c['purpose'])
    r.p('Available candidates: '+(', '.join(k+' '+tname(T[k]) for k in c['pool']) or 'None assigned to '+s['courseName'])+'.')
    if c.get('pool'):r.p('Coordinator variant: only the listed candidates may be active and assigned to this course in this isolated snapshot. Restore the baseline afterward.')
    if c.get('loads'):r.p('Workload override: '+', '.join(k+' = '+str(v) for k,v in c['loads'].items())+' active, profile-complete assigned students. These counts are derived, not editable teacher form fields.')
    if c.get('child'):r.p('Birthday override: use the coordinator’s date that makes the learner exactly age 10 on the test date. T01 has “will not teach children” selected; T06 accepts children.')
    r.p('Course: '+s['courseName']+' | Scores (five rubric fields in order): '+scores(s)+' | Computed level: '+level(s)+'.')
    r.p(' | '.join(k+': '+v for k,v in inputs(s)))
    if c.get('available'):r.p('Schedule override: select the agreed upcoming Monday, Morning and 25-minute duration. T01 has no available slot; T06 is available 08:00–10:00 on that date without bookings/breaks; all other dates are unmarked. The helper prediction assumes these availability verdicts; the deployed case must verify the actual date/window.')
    r.steps(['Sign in, open a fresh Create Student page and confirm the case’s prepared candidate pool and workload.','Enter the course, birthday and five scores above; check the computed level. Select the listed chips and leave notes blank. Add the schedule only for TC13.','Leave Assigned Teacher at Select Teacher'+(' except this case: explicitly choose '+tname(T[c['preferred']])+' before analysis.' if c.get('preferred') else '.'),'Click Analyze with AI. Read the teacher, coverage, mode and warnings. Capture inputs and result; compare with the expected behavior below.'])
    if expected['teacher']:
        strength=expected['strength'];r.p('Expected: '+expected['name']+' ('+expected['teacher']+'); score '+str(expected['score'])+'; '+strength['level']+' coverage '+str(strength['matched'])+'/'+str(strength['total'])+'.')
        selected=next(x for x in c['ranking'] if x['teacher']==expected['teacher'])
        r.p('Code-derived basis: '+', '.join(k+' '+('matched' if v else 'not matched') for k,v in selected['criterionMatches'].items())+'. Experience, course and load also contribute to the score.')
        if c['id']=='TC07':r.p('Several teachers can satisfy the four categories. Rules select Sam because of the full weighted ordering; exact scores are in the JSON. In a separate live AI run, Jamie, Sam or Casey are plausible alternatives only when the explanation agrees with their profiles.')
        if c['id']=='TC10':r.p('Important limitation: Advanced gives Jamie an experience advantage even though the only preference (grammar) is uncovered. Expect weak coverage; this is current behavior, not a claim of ideal educational fit.')
        if expected.get('leastLoadedFallback'):r.p('Expected warning: least-loaded fallback because every candidate is at or above the load target.')
        if expected.get('preferredHonouredOverLimit'):r.p('Expected warning: explicit administrator choice was honored despite exceeding the load preference.')
    else:r.p('Expected: no recommended teacher; no-teacher-for-course feedback for OPIc. Do not infer there are no teachers in the school.')
    r.p('Actual teacher / coverage / mode / warnings: __________________________________________________')
    r.p('Evidence filenames / issue ID / retest: ________________________________________________________')
    r.p('Verdict: Not run / Pass / Fail / Blocked     Tester / date: _________________________________')

extra=[
 ('TC17','Live AI ranking','S01',[
  'Have the coordinator confirm that live AI is enabled and the eight-teacher baseline is restored. Start with S01 in a fresh form; keep notes and preferred time blank.',
  'Analyze and inspect the explanation. Ask the coordinator to confirm response advisor.used = true. A request that falls back does not execute this live AI case.',
  'Repeat three times from fresh forms; retain every result and explanation, not just the preferred result.'
 ],'Accept a course-eligible teacher whose actual specialization/style/pace support S01, with a truthful explanation. Jamie is a strong reference; alternatives require reviewer justification. No exact AI order is required. Record unsupported claims as Fail; record unavailable AI as Blocked. The known missing-profile contract is an existing defect, not a reason to waive acceptance.'),
 ('TC18','AI interpretation of trial notes','S01',[
  'Use a fresh form and Conversational English. Enter S01’s five scores but leave all four matching categories unselected and Assigned Teacher blank.',
  'Enter this note exactly: The learner wants everyday speaking practice, prefers learning through conversation, and needs slow, guided explanations.',
  'Analyze; capture any auto-selected chips, inference message, recommendation and ranking mode. Repeat from a fresh form without the note to compare.'
 ],'Expected acceptable additions are allowed values supported by the note: conversation, speaking, conversational and slow. Not every field must be inferred, but at least a supported addition is needed to demonstrate inference. No additions/unreadable output is not proof of success. Inference and ranking have separate availability; record each. Do not require a fixed teacher name for nondeterministic output.'),
 ('TC19','Select, save and reopen the assigned teacher','S01',[
  'Only in the authorized non-production save session, use S01’s assessment and a coordinator-supplied unique disposable email. Complete required name, country, adult birthday and all five level scores.',
  'Analyze, review the result, then explicitly select the course-eligible teacher agreed with the reviewer. Record that final selection. Set the class package/duration using coordinator-supplied valid values.',
  'Click Create Student and complete any confirmation. Reopen the student through Account Management or have the coordinator inspect its saved profile. Compare assigned teacher, course, level and notes with the final form.',
  'Record the created test account ID and any invitation message. Stop if save fails; do not repeatedly submit the same email. Ask the coordinator to restore the baseline afterward.'
 ],'The final selected teacher is persisted as student_profiles.assigned_teacher_id, with the computed proficiency_level and course_id. Criteria and rubric scores are included in trial_notes. Save recalculates matching and honors an explicit choice; capture the persisted value rather than assuming it equals the preview. Creating an account does not prove a lesson was booked.'),
]
for cid,title,sid,procedure,accept in extra:
    r.h(cid+' | '+title,True);r.p('Student: '+sid+' / '+sname(S[sid])+' | Pool: baseline course-eligible teachers from Document 2 | Starting verdict: Not run')
    r.steps(procedure);r.h('Acceptable outcome',minor=True);r.p(accept)
    r.p('Actual result / mode / explanation: __________________________________________________________')
    r.p('Evidence / issue / saved record ID: __________________________________________________________')
    r.p('Verdict: Not run / Pass / Fail / Blocked     Tester / date: _________________________________')
reports.append(r.save())

r=Report('04_Matching_Algorithm_Explanation','Matching Algorithm Explanation','Implementation audit | Exact rules, data flow and known gaps')
r.p('Source inspection date: 17 November 2026. This package does not change code, database contents or application behavior. Expected rule outcomes are calculated with imported pure functions; deployed feature correctness has not been established.')
r.h('Implemented architecture')
r.p('The feature combines deterministic scoring with two optional Gemini services. Analyze submits criteria, course, notes, computed level, selected teacher, birthday and optional schedule to POST /api/admin/recommend-teacher. deriveMatchInsights maps notes to allowed criteria. recommendTeacher loads the active course pool, scores candidates, optionally applies advisor order, then applies availability, child suitability and selection policy.')
r.p('The form displays a single recommended teacher with reasons, coverage and warnings and fills Assigned Teacher. The response also contains rankedTeachers; the inspected UI does not show a full ranked score table. Save uses POST /api/admin/users and recalculates matching before persisting the final assignment.')
r.h('Five intended criteria: audit result')
r.table(['Criterion','Actual implementation','Important limit'],[['Proficiency Level','computeProficiencyLevel from five 1–5 rubric scores; experience threshold adjusts rule score.','Not explicitly supplied to the advisor prompt; not part of the four-category coverage count.'],['Learning Goal','Goal-to-specialization map; +12 per hit, cap 2.','Exact allowed values; AI may add values from notes.'],['Focus Area','Focus-to-specialization map; +10 per hit, cap 2.','Two focuses sharing one specialization can each score.'],['Learning Style','Exact overlap with parsed Teaching style tags; +10 per hit, cap 2.','Raw profile tags must use the accepted vocabulary.'],['Learning Pace','Exact overlap with parsed Best student pace tags; +8 per hit, cap 2.','Pace is a preference, not a hard eligibility filter.']],[1960,3900,3500])
r.p('Conclusion: all five are present in rules scoring. This is not equivalent to verifying all five inside live AI ranking. There is no implemented teacher-proficiency/degree/certificate matching field in this path.')
r.h('Critical AI data-contract finding',True)
r.p('backend/teacherMatching.js::scoreTeacherForStudent parses raw bio and specialization internally but returns the raw teacher plus score, criteria coverage and reasons, with no nested profile. backend/server.js::scoreWith spreads that result and adds availability. backend/teacherAdvisor.js::describeCandidates reads teacher.profile || {} and then reads profile.specialization, teachingStyle, idealStudentPace, experienceYears and bio.')
r.p('A local, side-effect-free reproduction calls the actual scorer and the extracted describeCandidates function with T01. The adapter receives specialization [], teachingStyle [], bestStudentPace [], experienceYears null and bioExcerpt "", even though T01 has all those attributes in the raw row. ID, name, active load and availability still reach the adapter.')
r.p('Impact: current live AI may rank candidates without the intended teaching attributes. Model completion, a displayed explanation or advisor.used = true does not prove a suitable match. TC17 must assess explanation truthfulness against stored profiles. This finding is documented, not fixed.')
r.h('Proficiency in the AI branch',minor=True)
r.p('adviseTeacherRanking receives criteria, trialNotes, courseName, scored rows and availability, but no proficiencyLevel argument. buildPrompt lists four preference categories and notes, and does not include the rule score. Level can affect rules ordering and a capped shortlist, but does not provide an explicit proficiency instruction to the model. Notes may incidentally mention a level; that is not a direct level contract.')
r.h('Other interpretation limits',minor=True)
r.p('Student trial notes are ignored by the deterministic score directly. They can affect matching through AI-derived criteria and through the advisor prompt. Teacher-name tokens are excluded from the weak free-text signal. A score is not a probability. Coverage reflects four categories, not each selected option and not proficiency.')
r.h('Level computation and weighting',True)
r.p('Rubric keys: speakingPronunciation, readingComprehension, structure, sentenceGrammar, vocabulary. Enter complete integer values 1–5. Rules are evaluated in the following order; the first match wins.')
r.table(['Rule','Computed level'],[['Any core reading/structure/grammar/vocabulary score = 1','Novice (stored novice-low)'],['Every score >= 4 and mean >= 4.5','Advanced'],['Every score >= 3 and mean >= 3.5','Intermediate High'],['Every score >= 3','Intermediate Mid'],['Otherwise mean >= 2.8','Intermediate Mid'],['Otherwise','Intermediate Low']],[6360,3000])
r.p('Experience minimum by stored level: Novice 0, Intermediate Low 1, Intermediate Mid 2, Intermediate High 3, Advanced 5 years. For levels needing more than zero years: sufficient experience adds 6; a shortfall subtracts 2 per missing year. This is a score adjustment, not a minimum-experience exclusion.')
r.h('Complete deterministic score',minor=True)
r.p('2 × min(experience years, 10) + 14 for selected-course match + up to 2 goal hits × 12 + up to 2 focus hits × 10 + up to 2 style hits × 10 + up to 2 pace hits × 8 + proficiency adjustment + up to 2 teacher-prose category signals × 3 − 2 × active assigned students. Values are normalized/parsed as implemented in teacherMatching.js.')
r.p('rankTeachers sorts descending score, then ascending load. Equal score/load retains input order; the SQL pool is ordered by first and last name. Selection prefers below-two-load candidates, then least loaded when all are at the target. The manual explicit-pick path can override the target and warns.')
r.h('Pool restrictions and additional factors',True)
r.p('The query restricts users.role = teacher, users.status = active, and selected course membership in teacher_courses. It intentionally does not exclude incomplete teacher profiles. Workload counts only assigned students whose user account is active and profile_completed = TRUE. It is not class bookings or package count.')
r.p('preferAvailable stably moves teachers with at least one suitable upcoming date first, after AI ordering. Availability uses teacher_availability per date, scheduled classes, breaks and class duration across a 21-day window. UI periods are Morning 06:00–12:00, Afternoon 12:00–17:00 and Evening 17:00–24:00. No preference means no availability query; no match still yields a recommendation with conflict information.')
r.p('preferTeachesChildren is applied after availability for known age <= 12. It moves teachers who accept children ahead of opt-outs. Missing birthday is reported unknown. If everyone opts out, a recommendation can still be returned with childAgeConflict; a manual/load policy can also affect final selection. Do not describe these as absolute exclusion filters.')
r.p('The AI advisor caps its strongest rules shortlist at 60, temperature 0.2; insights uses 0.1. Invalid/unrecognized candidate IDs are discarded; unmentioned eligible candidates remain in the order. Configuration, timeouts, bad responses and service failures trigger rules-only operation. Transport failures can open the process-local advisor circuit after three failures for five minutes.')
r.h('Coverage and saving behavior',minor=True)
r.p('assessMatchStrength: all selected categories matched = strong; at least half = partial; less than half = weak; zero categories selected = unknown. Four-category coverage can be strong even if not every item in a multi-select category overlaps. Creation requires complete rubric scores; backend recomputes the saved level. Analyze uses the supplied level normalized by the server, so a successful preview is not proof of the save path.')
r.h('Storage fields actually read and written',True)
r.table(['Table / field','Use'],[['users.user_id, first_name, last_name, role, status','Candidate identity and eligibility. Email is selected but is not sent to the AI adapter.'],['users.profile_completed','Counts active assigned student load; not a teacher-pool exclusion.'],['users.birth_date','Student age input/persistence; nullable-text encryption is used by application paths.'],['teacher_profiles.bio','Free-text prose plus AI matching profile tags for style and pace.'],['teacher_profiles.specialization, experience_years, teaches_children','Rule scoring, experience fit and child suitability. teaches_children is also ensured by runtime schema preparation.'],['teacher_courses.teacher_id, course_id; courses.course_name','Course eligibility and catalog labels.'],['student_profiles.proficiency_level, assigned_teacher_id, course_id, trial_notes','Saved level, selected teacher and course; criteria and rubric scores are appended inside encrypted trial_notes.'],['teacher_availability date/status/time/break fields; classes scheduled date/time/status','Availability and collision evaluation.'],['student_class_packages','Class allowance, duration and term when a student is saved; not a ranking qualification field.']],[4400,4960])
r.p('Style and pace are not separate teacher database columns in this path. Student matching criteria are not separate student columns in this path. student_contract_requests.ai_criteria exists for contract workflows; it must not be confused with initial student profile storage. The SQL dump is supplemented by runtime schema preparation in server.js.')
r.h('Source references')
for file,items in D['sourceIndex'].items():
    if items:r.p(file+': '+ '; '.join(str(x['line'])+' '+x['text'].split('{')[0].strip() for x in items))
r.p('Database definitions: backend/Database.sql (student_profiles, teacher_profiles, teacher_courses, users); runtime schema, candidate query, availability reads and assignment writes in backend/server.js. Option catalogs and course-scoping logic: frontend/src/utils/matchingCriteria.js. Matching form/preview/create/display: frontend/src/pages/AdminDashboard.jsx.')
r.h('Status of the alpha package',minor=True)
r.p('Implemented code has been inspected and synthetic reference expectations calculated. The 19 QA cases remain Not run. Teacher provisioning, deployed AI behavior, persistence, user acceptance and all three testers’ actual outcomes remain to be verified. No planned correction is presented as already implemented.')
reports.append(r.save())

(OUT/'document-structural-qa.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
index='<!doctype html><html><head><meta charset="utf-8"><title>AI Matching Alpha Testing Package</title></head><body style="max-width:850px;margin:40px auto;font:17px/1.6 Arial"><h1>AI Matching Alpha Testing Package</h1><p>Four editable documents for three QA testers. No questionnaire. Sample data only; no database records inserted. Deployed cases remain Not run.</p><ol>'+''.join('<li><a href="'+x['file']+'">'+html.escape(x['title'])+'</a> — <a href="'+Path(x['file']).stem+'.html">Read in browser</a></li>' for x in reports)+'</ol><p>Known code finding: the AI advisor expects teacher.profile but receives scored raw teacher rows; see document 4. Proficiency is used by rules but is not explicitly passed into the AI ranking prompt.</p></body></html>'
(OUT/'index.html').write_text(index,encoding='utf-8')
(ROOT/'docs/matching-evidence/AI_Teacher_Matching_Validation.html').write_text(index.replace('href="','href="../../alpha-testing-ai-matching/'),encoding='utf-8')
(OUT/'README.md').write_text('# AI Teacher Matching alpha package\n\nFour Word documents, matching browser-readable versions, and fictional JSON fixtures. The questionnaire is excluded. No application/database changes or account insertion.\n\nAll deployed QA cases start **Not run**. Coordinator provisioning and authorized test access are prerequisites. Reproduce the pure-function references with `node scripts/build-alpha-matching-data.mjs`; generate documents with the managed document Python runtime and `scripts/build-alpha-matching-documents.py`.\n\nThe `advisorContractAudit` in the JSON reproduces the missing nested-profile data contract. It is a local calculation, not a live AI result.\n',encoding='utf-8')
print('Created four editable documents; 8 teachers, 8 student profiles, 19 unexecuted cases. Questionnaire excluded.')
