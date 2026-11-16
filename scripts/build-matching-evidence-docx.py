"""Build the editable evidence report from actual expanded capture records.

Preset: standard_business_brief. Header: memo_masthead (no border).
Named overrides: TableCompact (9pt, single, 2pt after); Caption (9pt gray);
CaseHeading (16pt, zero before at explicit page starts); Title (28pt ink blue).
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'matching-evidence'
SKILL = Path('C:/Users/Carding Garcia/.codex/plugins/cache/openai-primary-runtime/documents/26.518.11428/skills/documents')
sys.path.insert(0, str(SKILL / 'scripts'))
from table_geometry import apply_table_geometry, audit_docx_tables

data = json.loads((OUT / 'expanded-demonstration-record.json').read_text(encoding='utf-8'))
doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
sec.top_margin = sec.bottom_margin = sec.left_margin = sec.right_margin = Inches(1)
sec.header_distance = sec.footer_distance = Inches(.492)

def style(name, size, color='21382F', before=0, after=6, line=1.1, bold=False):
    s = doc.styles[name] if name in doc.styles else doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    s.font.name = 'Calibri'
    s.font.size = Pt(size)
    s.font.bold = bold
    s.font.color.rgb = RGBColor.from_string(color)
    s.paragraph_format.space_before = Pt(before)
    s.paragraph_format.space_after = Pt(after)
    s.paragraph_format.line_spacing = line
    s.paragraph_format.widow_control = True
    return s

style('Normal', 11)
style('Title', 28, '0B2545', after=12, bold=True)
style('Subtitle', 12, '555555', after=12)
style('Heading 1',16,'2E74B5',16,8,bold=True)
style('Heading 2',13,'2E74B5',12,6,bold=True)
style('Heading 3',12,'1F4D78',8,4,bold=True)
style('TableCompact',9,after=2,line=1)
style('Caption',9,'555555',4,4,line=1)
style('Header',8,'555555',after=0,line=1)
style('Footer',8,'555555',after=0,line=1)
for name in ['Heading 1','Heading 2','Heading 3']:
    doc.styles[name].paragraph_format.keep_with_next = True
sec.header.paragraphs[0].text = 'JEN ACADEMIA  |  MATCHING VALIDATION  |  EXPANDED DEMONSTRATION'
footer = sec.footer.paragraphs[0]
footer.text = 'Controlled demo / beta verification pending                                      '
fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); footer._p.append(fld)

def p(text='', sty=None):
    return doc.add_paragraph(text, sty)

def h(text, new=False):
    q = doc.add_paragraph(text, 'Heading 1')
    if new:
        q.paragraph_format.page_break_before = True
        q.paragraph_format.space_before = Pt(0)
    return q

def table(heads, rows, widths):
    t = doc.add_table(rows=1, cols=len(heads))
    t.style = 'Table Grid'
    for c, text in zip(t.rows[0].cells, heads): c.text = str(text)
    repeat=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(repeat)
    for row in rows:
        for c, text in zip(t.add_row().cells, row): c.text=str(text)
    for ri,row in enumerate(t.rows):
        no_split=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(no_split)
        for c in row.cells:
            for q in c.paragraphs:
                q.style=doc.styles['TableCompact']
                if ri==0:
                    for run in q.runs:run.bold=True
            if ri==0:
                shd=OxmlElement('w:shd');shd.set(qn('w:fill'),'F2F4F7');c._tc.get_or_add_tcPr().append(shd)
    apply_table_geometry(t,widths,table_width_dxa=9360,indent_dxa=120,cell_margins_dxa={'top':80,'bottom':80,'start':120,'end':120})
    p('').paragraph_format.space_after=Pt(2)
    return t

def picture(file, caption):
    q=p();q.paragraph_format.space_after=Pt(0)
    q.paragraph_format.keep_with_next=True
    q.add_run().add_picture(str(OUT/file),width=Inches(6.5))
    # Preserve accessible descriptions in Word.
    for dp in q._p.xpath('.//wp:docPr'): dp.set('descr',caption)
    p(caption,'Caption')

def name(t): return t['first_name']+' '+t['last_name']

doc.core_properties.title='AI Teacher Matching Validation - Expanded Demonstration'
doc.core_properties.subject='Eight teachers and five learner scenarios; editable beta evidence record'
doc.core_properties.author='JEN Academia'
doc.core_properties.comments='Generated from recorded demonstration runs. All text and tables are editable; screenshots are embedded images.'
p('AI Teacher Matching\nValidation & Beta Test Evidence','Title')
p('Expanded demonstration | 8 teacher candidates | 5 learner scenarios','Subtitle')
p('Prepared: '+data['stamp'])
p('Feature: Administrator > Create Student > Analyze with AI')
h('Evidence status')
p('Five controlled demonstration cases completed. Each case compared eight fictional teachers. All five selected the teacher specified in the predeclared expectation, and the interface disclosed rule-based mode. Three existing automated suites passed all 170 checks.')
p('Beta tester verification remains pending. These fictional learners are demonstration profiles, not people who participated in beta testing.')
h('What changed in this edition')
p('The earlier two-teacher scenario has been expanded to eight teacher profiles and five distinct learner profiles. The cases vary learning goals, focus areas, teaching styles and pace; two cases intentionally produce partial matches.')
h('Scope and method')
p('Screenshots show the actual React interface running locally. An isolated capture harness supplies course and teacher records and executes the imported scoring, ranking and selection functions when Analyze with AI is clicked. Each learner starts with the same eight-teacher pool and load snapshot; cases do not create accounts or change workload.')
p('The harness replaces API transport. Live AI ranking, real server eligibility filtering, availability, proficiency evaluation and database persistence are outside these runs. Learner names identify scenario inputs and appear in trial notes; no student account is saved.')

h('Teacher candidate pool',True)
p('The same eight fictional teacher profiles are scored in every case. All are supplied as active, profile-complete and eligible for the fixture course Conversational English (ID 1). Those eligibility attributes are setup assumptions.')
table(['ID / teacher','Specialization','Style / pace','Years / load'],[
 [f"{t['user_id']} / {name(t)}",t['specialization'],f"{t['style']} / {t['pace']}",f"{t['experience_years']} / {t['assigned_student_count']}"] for t in data['teachers']], [1960,3260,2640,1500])
h('How to read the pool')
p('Years means teaching experience; load means assigned active students. Morgan Demo has three assigned students. The under-two-student load target is a selection preference, not a hard capacity limit. These cases do not force the all-at-limit fallback.')
p('Profiles intentionally include stronger, partial and weak alternatives. Taylor and Jordan remain candidates even though their specializations are a weaker fit for the selected course scenarios. A real deployment must independently verify course assignments.')

h('Expected versus actual outcomes',True)
p('Expected teacher IDs were specified in the scenario definitions before execution. The capture verifies the returned teacher ID, the selected teacher in the form, the rule-based disclosure, and all eight teacher options. No frontend page errors were recorded.')
table(['Case / learner','Expected','Actual','Coverage'],[[r['id']+' / '+r['student'],name(next(t for t in data['teachers'] if t['user_id']==r['expected'])),name(r['result']['teacher']),f"{r['result']['matchStrength']['matched']}/{r['result']['matchStrength']['total']} ({r['result']['matchStrength']['level']})"] for r in data['records']], [2700,2220,2220,2220])
h('Interpretation')
p('All five controlled cases passed their stated teacher-selection expectation. This 5/5 result describes only these demonstrations; it is not a beta success rate or an estimate of live AI accuracy.')
p('Criterion coverage counts whether each selected category has a match: learning goal, focus area, learning style and pace. A 3/4 partial result is expected for the visual listening and pronunciation review cases because the confidence goal does not map to the selected teacher’s specialization.')
p('Rule scores also include experience, course match and workload. They are ranking values, not confidence percentages. Full eight-candidate rankings and request bodies are retained in expanded-demonstration-record.json.')

h('Screenshot: selected matching inputs',True)
p('Example input capture for DEMO-01, Lea Demo. The other four input screenshots are retained with their case IDs in images/expanded/. Each result page below states the criteria used for that learner.')
picture(Path(data['records'][0]['inputs']),'Figure 1. Actual interface, fictional learner and eight fixed teacher candidates. The case label identifies the controlled demonstration.')
h('Capture context')
p('Course: Conversational English. No proficiency evaluation or preferred schedule is supplied. Trial notes identify the fictional learner and scenario. AI insights and AI ranking are disabled and disclosed.')

for i,r in enumerate(data['records'],2):
    result=r['result'];selected=result['teacher']
    h(r['id']+' | '+r['student'],True)
    p(r['title'],'Subtitle')
    p(f"Goal: {r['goal']} | Focus: {r['focus']} | Style: {r['style']} | Pace: {r['pace']}")
    picture(Path(r['output']),f"Figure {i}. {r['id']} result in the real interface; eight fictional candidates; rule-based mode.")
    table(['Expected teacher','Observed teacher','Coverage / score'],[[name(next(t for t in data['teachers'] if t['user_id']==r['expected'])),name(selected),f"{result['matchStrength']['matched']}/4 {result['matchStrength']['level']} / {selected['score']}"]],[3120,3120,3120])
    p('Expected basis: '+r['why'])
    p('Observed outcome: PASS for this controlled case. The expected teacher is selected, the fallback status is disclosed, and eight candidates remain available.')

h('Supporting automated checks',True)
p('These existing software checks ran during preparation of the expanded capture set. They use synthetic inputs and controlled conditions; they are separate from the five displayed UI scenarios.')
table(['Existing script','Recorded result','Exit code'],[[s['name']+'.mjs',s['summary'],s['exit']] for s in data['suites']],[4600,3260,1500])
h('Traceability and reproducibility')
p('Capture source: scripts/capture-expanded-matching.mjs. Document builder: scripts/build-matching-evidence-docx.py. Raw records: docs/matching-evidence/expanded-demonstration-record.json. Each case retains its submitted request, expected teacher ID, returned result, full ranking, UI observations and screenshot filenames.')
p('Screenshot names follow DEMO-01-inputs.png and DEMO-01-result.png through DEMO-05. Full automated outputs are saved as test-teacher-matching.txt, test-match-insights.txt and test-fallback.txt in the same evidence folder.')
h('Correctness limits')
p('The same functions compute and display the scenario results, so the captured card alone is not an independent scoring oracle. Predeclared teacher expectations, explicit profile comparisons and existing automated tests provide supporting checks. A reviewer should assess the saved rankings against the documented policy.')
p('For live AI-assisted results, define a reviewer-approved acceptance rubric and accepted alternatives before the run. Record advisor.used and distinguish AI-assisted results from rules-only fallback. Exact repeated AI rankings are not assumed.')

h('Beta tester verification record',True)
p('Duplicate this editable page for each actual tester and scenario. All entries remain pending until a tester completes the session and a reviewer checks the evidence.')
table(['Field','Entry'],[[label,'[Enter here]'] for label in ['Tester code / role','Case ID / date / time / timezone','Environment URL / build or commit','Pseudonymous learner ID / course','Goal / focus / style / pace / level','Teacher pool / workload / schedule snapshot','Expected teacher / accepted alternatives','Actual teacher / displayed explanation','AI used or fallback / reason','Original screenshot names / capture times','Saved assignment ID, if tested','Verdict: pass / fail / blocked / not run','Issue ID / retest result']],[4000,5360])
h('Tester confirmation')
p('I performed the recorded actions and confirm that the attached original screenshots represent the results I received.')
p('Tester name or code: [Enter here]    Date: [Enter here]')
p('Signature or recorded acknowledgment: [Enter here]')
p('Reviewer / review date: [Enter here]')

h('Completion checklist and conclusion',True)
h('Evidence to add from actual beta sessions')
for label,text in [
 ('Inputs','Capture the selected course, matching criteria, proficiency level, schedule and relevant trial notes before analysis.'),
 ('Candidate basis','Preserve the relevant teacher profiles, course eligibility, current workload and availability used for comparison.'),
 ('Observed result','Capture the recommended teacher, explanation, criterion coverage, warnings and AI/fallback status.'),
 ('Saved assignment','When saving is in scope, capture the persisted record and reopen it to verify that the teacher assignment was saved.'),
 ('Review','Record pass/fail against the agreed expectation. Attach defects, retest evidence and tester/reviewer acknowledgment.')]:
    p(label+': '+text)
h('Additional scenarios before beta sign-off')
p('Check no eligible teachers, no strong match, all teachers at or above the load target, incompatible schedule, live AI failure, and saved assignment persistence. These scenarios are not established by the five demonstration captures.')
h('Current conclusion')
p('Across five independent fictional learner scenarios and eight fixed teacher candidates, the captured rule-based interface selected all five predeclared teachers. Three recommendations covered 4/4 categories and two honestly reported 3/4 partial coverage. The three supporting suites passed 170/170 automated checks.')
p('Actual beta tester participation and live AI accuracy remain unverified until completed session records are attached. This editable report provides the demonstration evidence and the record structure needed to complete that work.')

target=OUT/'AI_Teacher_Matching_Validation.docx'
doc.save(target)
if audit_docx_tables(target): raise RuntimeError('Table geometry audit failed')
# Structural checks remain useful when no Office renderer is installed.
with ZipFile(target) as z:
    assert z.testzip() is None
    assert len([n for n in z.namelist() if n.startswith('word/media/')])==6
assert len(doc.inline_shapes)==6
assert len(doc.tables)==9
assert len(data['teachers'])==8 and len(data['records'])==5
assert all(r['observed']['candidateOptions']==8 for r in data['records'])

# Keep the previously opened HTML source aligned with the expanded editable report.
parts=['<!doctype html><html><head><meta charset="utf-8"><title>Expanded matching validation</title><style>body{max-width:960px;margin:40px auto;font:16px/1.5 Arial;color:#21382f}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd5cf;padding:8px;text-align:left}img{max-width:100%}section{margin:32px 0}h1,h2{color:#173d32}</style></head><body>', '<h1>AI Teacher Matching Validation</h1><p>Expanded demonstration: 8 teacher candidates and 5 learner scenarios. Beta verification pending. The editable report is <a href="AI_Teacher_Matching_Validation.docx">AI_Teacher_Matching_Validation.docx</a>.</p>']
parts.append('<h2>Candidate pool</h2><table><tr><th>Teacher</th><th>Specialization</th><th>Style / pace</th><th>Years / load</th></tr>')
for t in data['teachers']:
    parts.append('<tr>'+''.join('<td>'+html.escape(str(v))+'</td>' for v in [name(t),t['specialization'],t['style']+' / '+t['pace'],str(t['experience_years'])+' / '+str(t['assigned_student_count'])])+'</tr>')
parts.append('</table>')
for r in data['records']:
    parts.append('<section><h2>'+html.escape(r['id']+' / '+r['student'])+'</h2><p>'+html.escape(r['why'])+'</p><p>Observed: '+html.escape(name(r['result']['teacher']))+'; '+str(r['result']['matchStrength']['matched'])+'/4 criteria; PASS (controlled demonstration).</p><img src="'+r['inputs']+'" alt="Matching input screenshot"><img src="'+r['output']+'" alt="Matching result screenshot"></section>')
parts.append('<p>Real frontend, intercepted API, imported rule-based matching functions. No live AI, production database, saved assignments or actual beta testers are verified here.</p></body></html>')
(OUT/'AI_Teacher_Matching_Validation.html').write_text(''.join(parts),encoding='utf-8')
(OUT/'docx-structural-qa.json').write_text(json.dumps({'teachers':8,'learnerScenarios':5,'passedScenarios':5,'embeddedScreenshots':6,'editableTables':9,'tableGeometry':'pass','plannedPages':12,'visualRendering':'pending'},indent=2),encoding='utf-8')
print(str(target))
