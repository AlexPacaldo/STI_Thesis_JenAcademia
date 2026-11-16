"""Editable tester guide. Preset: standard_business_brief; memo_masthead.
Named overrides: compact 9pt tables; 9pt captions; 28pt title; zero heading
space before explicit page starts. Genuine Word numbering is used for steps.
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
from docx.shared import Inches, Pt, RGBColor

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/matching-evidence'
SKILL=Path('C:/Users/Carding Garcia/.codex/plugins/cache/openai-primary-runtime/documents/26.518.11428/skills/documents')
sys.path.insert(0,str(SKILL/'scripts'))
from table_geometry import apply_table_geometry,audit_docx_tables
data=json.loads((OUT/'expanded-demonstration-record.json').read_text(encoding='utf-8'))
doc=Document();s=doc.sections[0]
s.page_width,s.page_height=Inches(8.5),Inches(11)
s.top_margin=s.bottom_margin=s.left_margin=s.right_margin=Inches(1)
s.header_distance=s.footer_distance=Inches(.492)
def sty(name,size,color='21382F',before=0,after=6,line=1.1,bold=False):
    a=doc.styles[name] if name in doc.styles else doc.styles.add_style(name,WD_STYLE_TYPE.PARAGRAPH)
    a.font.name='Calibri';a.font.size=Pt(size);a.font.color.rgb=RGBColor.from_string(color);a.font.bold=bold
    a.paragraph_format.space_before=Pt(before);a.paragraph_format.space_after=Pt(after);a.paragraph_format.line_spacing=line
    a.paragraph_format.widow_control=True
    return a
sty('Normal',11);sty('Title',28,'0B2545',after=12,bold=True);sty('Subtitle',12,'555555',after=12)
for name,size,bef,aft in [('Heading 1',16,16,8),('Heading 2',13,12,6),('Heading 3',12,8,4)]:
    sty(name,size,'2E74B5' if size>12 else '1F4D78',bef,aft,bold=True).paragraph_format.keep_with_next=True
sty('GuideTable',9,after=2,line=1);sty('Caption',9,'555555',4,4,line=1)
sty('Header',8,'555555',after=0,line=1);sty('Footer',8,'555555',after=0,line=1)
sty('GuideStep',11,after=8,line=1.167)
s.header.paragraphs[0].text='JEN ACADEMIA | AI TEACHER MATCHING | TESTER GUIDE'
s.footer.paragraphs[0].text='Testing instructions / example screenshots use fictional data                     '
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');s.footer.paragraphs[0]._p.append(field)
parts=['<!doctype html><html><head><meta charset="utf-8"><title>AI Teacher Matching Testing Guide</title><style>body{max-width:950px;margin:40px auto;font:16px/1.5 Arial;color:#21382f}h1,h2{color:#173d32}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{padding:8px;border:1px solid #cad5cf;text-align:left;vertical-align:top}img{max-width:100%}section{margin:35px 0}figcaption{color:#555;font-size:13px}code{background:#f2f4f7}</style></head><body><p><a href="AI_Teacher_Matching_Testing_Guide.docx">Download editable Word guide</a></p>']
def p(text,style=None):
    q=doc.add_paragraph(text,style);parts.append('<p>'+html.escape(text)+'</p>');return q
def heading(text,new=False,level=1):
    q=doc.add_paragraph(text,'Heading '+str(level))
    if new:q.paragraph_format.page_break_before=True;q.paragraph_format.space_before=Pt(0)
    parts.append(f'<h{level+1}>'+html.escape(text)+f'</h{level+1}>');return q
def table(headers,rows,widths):
    t=doc.add_table(rows=1,cols=len(headers));t.style='Table Grid'
    for c,v in zip(t.rows[0].cells,headers):c.text=str(v)
    repeat=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(repeat)
    for row in rows:
        for c,v in zip(t.add_row().cells,row):c.text=str(v)
    for n,row in enumerate(t.rows):
        row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for c in row.cells:
            for q in c.paragraphs:
                q.style=doc.styles['GuideTable']
                for r in q.runs:r.bold=n==0
            if n==0:
                sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'F2F4F7');c._tc.get_or_add_tcPr().append(sh)
    apply_table_geometry(t,widths,table_width_dxa=9360,indent_dxa=120)
    parts.append('<table><thead><tr>'+''.join('<th>'+html.escape(str(v))+'</th>' for v in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(v))+'</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table>')
    return t
def picture(file,caption):
    q=doc.add_paragraph();q.paragraph_format.keep_with_next=True;q.paragraph_format.space_after=Pt(0)
    q.add_run().add_picture(str(OUT/file),width=Inches(6.5))
    for dp in q._p.xpath('.//wp:docPr'):dp.set('descr',caption)
    doc.add_paragraph(caption,'Caption')
    parts.append('<figure><img src="'+str(file).replace('\\','/')+'" alt="'+html.escape(caption,quote=True)+'"><figcaption>'+html.escape(caption)+'</figcaption></figure>')
def steps(items):
    numbering=doc.part.numbering_part.element
    abstract_ids=[int(x.get(qn('w:abstractNumId'))) for x in numbering.findall(qn('w:abstractNum'))]
    aid=max(abstract_ids,default=-1)+1
    abst=OxmlElement('w:abstractNum');abst.set(qn('w:abstractNumId'),str(aid))
    lvl=OxmlElement('w:lvl');lvl.set(qn('w:ilvl'),'0')
    for tag,val in [('start','1'),('numFmt','decimal'),('lvlText','%1.'),('lvlJc','left')]:
        child=OxmlElement('w:'+tag);child.set(qn('w:val'),val);lvl.append(child)
    pp=OxmlElement('w:pPr');ind=OxmlElement('w:ind');ind.set(qn('w:left'),'720');ind.set(qn('w:hanging'),'360');pp.append(ind);lvl.append(pp);abst.append(lvl);numbering.append(abst)
    nid=max([int(x.get(qn('w:numId'))) for x in numbering.findall(qn('w:num'))],default=0)+1
    num=OxmlElement('w:num');num.set(qn('w:numId'),str(nid));link=OxmlElement('w:abstractNumId');link.set(qn('w:val'),str(aid));num.append(link);numbering.append(num)
    for text in items:
        q=doc.add_paragraph(text,'GuideStep');props=q._p.get_or_add_pPr();np=OxmlElement('w:numPr')
        il=OxmlElement('w:ilvl');il.set(qn('w:val'),'0');ni=OxmlElement('w:numId');ni.set(qn('w:val'),str(nid));np.extend([il,ni]);props.append(np)
    parts.append('<ol>'+''.join('<li>'+html.escape(x)+'</li>' for x in items)+'</ol>')
def teachername(t):return t['first_name']+' '+t['last_name']
display={'conversation':'Conversational English / Conversation','confidence':'Confidence Building','news-discussion':'News Discussion','speaking':'Speaking','listening':'Listening','pronunciation':'Pronunciation','conversational':'Conversational Practice','visual':'Visual Learning / Visual Activities','interactive':'Interactive Activities','structured':'Structured Lessons','slow':'Guided Pace / Slow and Guided','balanced':'Balanced Pace / Balanced','fast':'Accelerated Pace / Fast-paced','review-heavy':'Review-focused Pace / Review-heavy'}

doc.core_properties.title='AI Teacher Matching - Scenario Testing Guide'
doc.core_properties.subject='Repeatable setup, scenarios, expected results and tester evidence'
doc.core_properties.author='JEN Academia'
p('AI Teacher Matching\nScenario Testing Guide','Title')
p('Sign in to the deployed site, use the prepared sample accounts, and record the matching results.','Subtitle')
p('Edition: 17 November 2026 | Editable Word guide')
heading('Start with the prepared testing accounts')
p('This guide is written for a facilitated session on the deployed JEN Academia site. The tester uses an assigned beta administrator login and a prepared sample teacher dataset. Account creation and database preparation are handled by the research team before the session.')
p('Session prerequisite: the facilitator confirms that the named sample teachers and workload counts in this guide are available in the deployed database. This document does not itself confirm that provisioning has been completed.')
heading('What you will need')
p('Have the deployed site link, your assigned beta administrator email and password, a browser, and a folder for screenshots. You will select the prepared learner scenarios and compare recommendations against the sample teacher profiles. The facilitator supplies access details separately.')
p('The screenshots are labeled reference examples from controlled runs. Capture your own deployed-site results during the session and attach them to the test record.')
table(['Session detail','Provided by the facilitator'],[['Deployed site URL','[Insert deployed site link]'],['Assigned administrator email','[Insert assigned beta administrator email]'],['Password / first-login instructions','Provided separately to the tester'],['Prepared dataset / build','[Insert confirmed dataset version and deployed build]'],['Data readiness confirmed by / date','[Facilitator name and confirmation date]']],[3200,6160])
heading('What a completed test record contains')
p('Case ID, tester code, environment/build, date/time/timezone, inputs, teacher pool, mode, expected outcome, actual result, screenshot filenames, verdict and reviewer confirmation. A fallback result cannot establish that live AI ranking worked.')

heading('1. Sign in to the deployed website',True)
steps([
 'Open the deployed site URL supplied by the facilitator. Record the URL and the date/time/timezone in your test record.',
 'Open Sign In and enter the assigned beta administrator email and password. Follow the supplied first-login instructions if required.',
 'Confirm that the administrator dashboard loads and that Create Student is available in the navigation. Teacher and student logins do not provide this administrator matching workflow.',
 'Check the sample teacher list or ask the facilitator to confirm that all eight listed accounts and their course assignments are ready. You do not need to sign in separately as each sample teacher.',
 'Open Create Student. Confirm that Conversational English is available and that the expected sample teachers appear in Assigned Teacher after the course is selected.',
 'If access or sample data is missing, mark the session Blocked and report it to the facilitator. Continue after the correct login or dataset has been supplied.'
])
heading('Scenario overview')
table(['Case','Learner','Expected teacher','Coverage'],[[r['id'],r['student'],teachername(r['result']['teacher']),str(r['result']['matchStrength']['matched'])+'/4'] for r in data['records']],[1800,2400,3000,2160])
p('These are baseline comparison targets for the prepared dataset in rule-based mode. The facilitator identifies whether the deployed session uses live AI or fallback. When live AI runs, evaluate the recommendation using the live AI acceptance section; an exact baseline ranking is not required.')

heading('2. Confirm the prepared sample data',True)
steps([
 'Use the sample dataset assigned to your session. The facilitator prepares the eight teacher accounts, matching attributes, course eligibility and workload counts before testing.',
 'Compare the available sample teachers with the next table. All eight should be active and assigned to Conversational English for this scenario set.',
 'Ask the facilitator to confirm the saved specialization, teaching style, pace and experience values. Report a mismatch rather than changing the sample accounts yourself.',
 'Check the workload snapshot: Morgan has 3 active assigned students, Alex and Jordan have 1 each, and the other sample teachers have 0. Workload is assigned students, not booked lessons or contracts.',
 'Confirm whether additional active teachers are eligible for this course. If the deployed pool differs from the prepared eight-teacher pool, record it before assessing the fixed baseline expectations.',
 'Run the scenarios as matching previews. Do not submit Create Student during the five baseline cases. Ask the facilitator to reset the dataset if another tester or a save test changes workload.'
])
p('The sample learner names identify five predefined input profiles. Use their criteria in a fresh Create Student matching preview; you do not need to create or log in to five new student accounts. Do not duplicate existing student records.')

heading('3. Sample teachers available for the session',True)
p('Use this table to identify the prepared sample teacher accounts and understand why each recommendation is expected. The facilitator confirms these profiles against the deployed database before handing the guide to testers.')
table(['Reference / name','Specialization','Style / pace codes','Years / load'],[[str(t['user_id'])+' / '+teachername(t),t['specialization'],t['style']+' / '+t['pace'],str(t['experience_years'])+' / '+str(t['assigned_student_count'])] for t in data['teachers']],[2000,3280,2580,1500])
heading('Reading the sample profiles')
p('Teacher style labels include Conversational, Structured, Visual, Interactive and Independent Practice. Teacher pace labels include Slow and Guided, Balanced, Fast-paced and Review-heavy. The table shows the stored codes so that the same options can be recognized when labels vary.')
p('Reference IDs 901–908 identify the demonstration profiles. The deployed database may use different IDs; match by the confirmed account name and record the actual ID if available.')
p('All eight must be eligible for Conversational English. Morgan’s load is 3; Alex and Jordan each have 1; everyone else has 0. Five independent baseline learner scenarios leave these counts unchanged.')
p('The matching function prefers teachers below the two-student load target. The target is not a hard maximum. The five baseline cases do not exercise the all-teachers-at-limit branch.')

heading('4. Run a scenario on the deployed site',True)
steps([
 'Open a fresh Create Student form for each case. Clear any previous recommendation and leave Assigned Teacher at Select Teacher. A previous explicit teacher selection can be honored and change the next result.',
 'Choose Conversational English. Do not score Level Evaluation and leave Preferred Class Time blank. Leave birthday blank for a matching-only preview; if the form requires it, use an agreed adult test birth date and record it.',
 'Select only the four matching choices listed on the case page. Use the chip labels corresponding to the stored codes. Clear all other chips and custom values.',
 'Leave Trial Class Notes empty for the fixed-criteria baseline. The selected criteria are sufficient to run analysis. Empty notes reduce additional inferred criteria; the deployed session may still use live AI ranking.',
 'Capture the selected course, all four criteria and blank optional inputs. Click Analyze with AI once, then wait for the result.',
 'Compare the teacher, coverage, explanation and mode against the case page. Capture the result and Assigned Teacher field. Record pass, fail or blocked; do not click Create Student for these matching-only cases.'
])
picture(Path(data['records'][0]['inputs']),'Reference input screen, not a deployed-session capture. It includes a scenario-identifying note; the fixed-criteria procedure uses empty notes. Capture your own inputs on the deployed site.')

for index,r in enumerate(data['records'],1):
    heading(r['id']+' | '+r['title'],True)
    p('Prepared learner scenario: '+r['student']+' | Exact baseline comparison: rules-only mode')
    table(['Matching field','Select this option / stored code'],[[label,display[r[key]]+' ['+r[key]+']'] for label,key in [('Learning Goal','goal'),('Focus Area','focus'),('Learning Style','style'),('Learning Pace','pace')]],[2700,6660])
    p('Run: start with a fresh form, apply the common baseline procedure, capture inputs, then click Analyze with AI. Use all eight prepared candidates and the unchanged workload snapshot.')
    p('Expected: '+teachername(r['result']['teacher'])+'; '+str(r['result']['matchStrength']['matched'])+'/4 categories ('+r['result']['matchStrength']['level']+'). '+r['why'])
    picture(Path(r['output']),f'Example result for {r["id"]}. Fictional controlled demo; use your own capture as the test evidence.')
    p('Rules-only pass: the expected teacher is selected, the expected coverage is shown, and fallback is disclosed. If live AI ran, use the live AI acceptance rubric and record whether the result meets the scenario needs.')

heading('5. Test live AI recommendations and trial notes',True)
p('Continue on the same deployed site using your assigned administrator account. The facilitator confirms that live AI is enabled for this part of the session. These tests require your own captures; the reference screenshots show fallback.')
steps([
 'Start with a fresh form and the verified teacher snapshot. Record the course, blank Assigned Teacher, level and schedule. Choose a rubric and accepted alternatives before running.',
 'For an explicit-criteria AI test, repeat one baseline profile. Analyze once and inspect the explanation and status. If the card says AI is unavailable or not configured, record Fallback and ask the facilitator to confirm AI availability before counting it as a live AI test.',
 'For a note-inference test, start a new form with Conversational English selected and no matching chips. Enter: “The learner wants everyday speaking practice, prefers learning through conversation, and needs slow, guided explanations.” Then analyze.',
 'Record which chips the AI adds. Accept only allowed vocabulary supported by the note; conversation/speaking, conversational style and slow pace are reasonable targets. Exact wording and the number of inferred fields need not match on every run.',
 'Check that the recommendation belongs to the eligible course pool and its explanation agrees with its stored profile. Jamie is a strong candidate for the example note, but preapproved alternatives may be acceptable when the model gives a supported reason.',
 'Repeat the live AI case three times from fresh forms, capturing each result separately. Record ranking/criteria variation rather than replacing earlier runs with the best one.'
])
heading('Acceptance rubric')
table(['Check','Pass condition'],[['AI ranking used','Live AI is confirmed for the run; no fallback warning is presented. The facilitator can verify the response status when needed.'],['Note inference','Added criteria use allowed options and are supported by the note. No additions means inference was not demonstrated.'],['Eligibility / explanations','No invented teacher or unsupported profile claim; teacher is in the eligible pool.'],['Quality / limitations','Recommendation addresses the stated needs; gaps and warnings are recorded.']],[2700,6660])

heading('6. Additional cases with facilitator support',True)
p('These cases use separate prepared conditions on the deployed test site. Ask the facilitator to select or reset the appropriate dataset; testers do not change teacher accounts or server configuration.')
table(['Scenario','Change one condition','Expected observation'],[
 ['AI unavailable','Use the fallback session arranged by the facilitator; repeat DEMO-01.','A usable rule-based result with an explicit fallback reason. Do not record this as AI success.'],
 ['No course candidates','Select the facilitator-provided sample course with no assigned active teachers.','Clear no-teacher-for-course feedback; no invented recommendation.'],
 ['No strong fit','Give a learner needs not fully covered by the eligible pool.','Closest available result with honest partial/weak coverage and explanation.'],
 ['Workload balancing','Use the prepared snapshot where the strongest candidate has load 2 or more and an alternative is below 2.','Automatic selection prefers a below-target candidate; record scores and load. Leave Assigned Teacher blank.'],
 ['All candidates at target','Use the prepared snapshot where all candidates have load 2 or higher, with unequal counts.','A least-loaded fallback can still be selected, with the appropriate warning.'],
 ['Schedule preference','Use the sample availability supplied by the facilitator, then choose the specified day/time and class duration.','Compare against that exact slot, timezone and duration; preserve availability and warning evidence.'],
 ['Persisted assignment','In a separate save test, complete required student/package fields, analyze, save, then reopen the record.','The saved teacher agrees with the final selected teacher; record the created test account ID.']],[1800,3780,3780])
heading('Keep the baseline reproducible')
p('Wait for the facilitator to confirm a reset before returning to the five baseline scenarios. Record adult/child suitability and complete level scores when those inputs are tested. Change only the scenario inputs specified for the case.')

heading('7. Record the result and attach evidence',True)
p('Duplicate this editable record for each case and each repeat. Leave the verdict as Not run until the test has actually been performed.')
table(['Field','Tester entry'],[[x,'[Enter here]'] for x in ['Tester code / case ID / repeat number','Deployed site URL / build / date / time / timezone','Assigned administrator account (email only)','Mode planned / observed: Live AI or Fallback','Prepared dataset / teacher IDs / workload counts','Course / four criteria / notes','Level / schedule / duration / birthday, if used','Expected result / accepted alternatives','Actual teacher / coverage / explanation','AI-added criteria / warnings / fallback reason','Input and result screenshot filenames','Verdict: Not run / Pass / Fail / Blocked','Issue ID / retest / saved record ID, if applicable']],[4160,5200])
heading('Screenshot checklist')
p('Input image: selected course and criteria, notes, and optional inputs. Result image: recommended teacher, reasons, coverage, mode/warnings and Assigned Teacher. Add the candidate profiles/load snapshot; include the reopened saved record only for a persistence test.')
p('Name files BT01-DEMO01-input.png and BT01-DEMO01-result.png, with repeat suffixes when needed. Retain original captures and hide unrelated personal details and credentials.')
p('Tester acknowledgment: [Enter here]    Reviewer / review date: [Enter here]')

heading('8. Troubleshooting and finishing the session',True)
table(['What happened','What to check before retrying'],[
 ['Different teacher from the baseline','Fresh form and blank Assigned Teacher; exact candidate pool and loads; AI mode; saved profile fields; added chips; level/schedule inputs.'],
 ['A sample teacher is missing','Confirm the deployed URL, assigned account and selected course. Ask the facilitator to check the prepared accounts and course assignments.'],
 ['Partial match appears','Compare the missing category with the profile. DEMO-02 and DEMO-05 intentionally have 3/4 coverage.'],
 ['No AI explanation','Check the mode disclosure. If fallback is shown, record its reason and ask the facilitator to confirm AI availability.'],
 ['Rerun keeps the old teacher','The previous analysis may have filled Assigned Teacher. Open a fresh form before analyzing an independent case.'],
 ['Cannot sign in / wrong dashboard','Use the assigned beta administrator login. Report access problems to the facilitator instead of creating another account.']],[3000,6360])
heading('Close the test')
steps(['Complete the case record and link all captures. Log reproducible failures with the smallest set of changed inputs.','Have a reviewer compare actual results with the predeclared acceptance criteria. Keep fallback, live AI and saved-assignment verdicts separate.','Sign out of the deployed site. Return the test record to the facilitator and identify any saved records that need resetting. Preserve the original screenshots.'])
p('Reference screenshots were captured on '+data['stamp']+'. They illustrate fictional sample profiles and remain examples until replaced with captures from the deployed testing session.')

target=OUT/'AI_Teacher_Matching_Testing_Guide.docx';doc.save(target)
assert audit_docx_tables(target)==0
assert len(doc.inline_shapes)==6
with ZipFile(target) as z:
    assert z.testzip() is None
    assert b'w:numPr' in z.read('word/document.xml')
parts.append('</body></html>')
(OUT/'AI_Teacher_Matching_Validation.html').write_text(''.join(parts),encoding='utf-8')
(OUT/'AI_Teacher_Matching_Testing_Guide.html').write_text(''.join(parts),encoding='utf-8')
(OUT/'guide-structural-qa.json').write_text(json.dumps({'screenshots':len(doc.inline_shapes),'tables':len(doc.tables),'teacherProfiles':8,'baselineScenarios':5,'realWordNumbering':True,'tableGeometry':'pass','visualRendering':'pending'},indent=2),encoding='utf-8')
print(target)
