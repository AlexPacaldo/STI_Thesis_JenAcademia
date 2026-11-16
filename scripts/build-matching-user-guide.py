"""Simple editable user guide; standard_business_brief, memo_masthead.
Named overrides: title 26pt, compact 10pt tables, 9pt captions.
"""
import html
import json
import sys
from pathlib import Path
from zipfile import ZipFile
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/matching-evidence'
sample_data=json.loads((OUT/'expanded-demonstration-record.json').read_text(encoding='utf-8'))
SKILL=Path('C:/Users/Carding Garcia/.codex/plugins/cache/openai-primary-runtime/documents/26.518.11428/skills/documents')
sys.path.insert(0,str(SKILL/'scripts'))
from table_geometry import apply_table_geometry,audit_docx_tables
doc=Document();sec=doc.sections[0]
sec.page_width,sec.page_height=Inches(8.5),Inches(11)
sec.top_margin=sec.bottom_margin=sec.left_margin=sec.right_margin=Inches(1)
sec.header_distance=sec.footer_distance=Inches(.492)
for name,size,color,before,after in [('Normal',11,'21382F',0,6),('Title',26,'0B2545',0,12),('Subtitle',12,'555555',0,12),('Heading 1',16,'2E74B5',16,8),('Heading 2',13,'2E74B5',12,6),('Heading 3',12,'1F4D78',8,4),('Caption',9,'555555',4,4),('Header',8,'555555',0,0),('Footer',8,'555555',0,0)]:
    s=doc.styles[name];s.font.name='Calibri';s.font.size=Pt(size);s.font.color.rgb=RGBColor.from_string(color)
    s.paragraph_format.space_before=Pt(before);s.paragraph_format.space_after=Pt(after);s.paragraph_format.line_spacing=1.1
    s.paragraph_format.widow_control=True
    if name.startswith('Heading'):s.font.bold=True;s.paragraph_format.keep_with_next=True
doc.styles['Title'].font.bold=True
sec.header.paragraphs[0].text='JEN ACADEMIA | AI TEACHER MATCHING'
sec.footer.paragraphs[0].text='User manual                                                                '
fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');sec.footer.paragraphs[0]._p.append(fld)
doc.core_properties.title='AI Teacher Matching - User Manual'
doc.core_properties.subject='Sign in, describe learning needs, and review a teacher recommendation'
doc.core_properties.author='JEN Academia'
parts=['<!doctype html><html><head><meta charset="utf-8"><title>AI Teacher Matching — Simple User Guide</title><style>body{max-width:880px;margin:40px auto;padding:0 20px;font:17px/1.6 Arial;color:#21382f}h1,h2,h3{color:#173d32}table{border-collapse:collapse;width:100%;margin:18px 0}td,th{border:1px solid #cad5cf;padding:10px;text-align:left;vertical-align:top}img{width:100%;border:1px solid #cad5cf}figcaption{font-size:14px;color:#555}section{margin:35px 0}</style></head><body><p><a href="AI_Teacher_Matching_User_Guide.docx">Download editable Word guide</a></p>']
def p(text,style=None):
    q=doc.add_paragraph(text,style);parts.append('<p>'+html.escape(text)+'</p>');return q
def h(text,new=False):
    q=doc.add_paragraph(text,'Heading 1')
    if new:q.paragraph_format.page_break_before=True;q.paragraph_format.space_before=Pt(0)
    parts.append('<h2>'+html.escape(text)+'</h2>')
def table(headers,rows,widths):
    t=doc.add_table(rows=1,cols=len(headers));t.style='Table Grid'
    for c,v in zip(t.rows[0].cells,headers):c.text=v
    t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
    for row in rows:
        for c,v in zip(t.add_row().cells,row):c.text=v
    for i,row in enumerate(t.rows):
        row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for c in row.cells:
            for q in c.paragraphs:
                q.paragraph_format.space_before=Pt(0);q.paragraph_format.space_after=Pt(2);q.paragraph_format.line_spacing=1
                for r in q.runs:r.font.size=Pt(10);r.bold=i==0
            if i==0:
                sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'F2F4F7');c._tc.get_or_add_tcPr().append(sh)
    apply_table_geometry(t,widths,table_width_dxa=9360,indent_dxa=120)
    parts.append('<table><tr>'+''.join('<th>'+html.escape(v)+'</th>' for v in headers)+'</tr>'+''.join('<tr>'+''.join('<td>'+html.escape(v)+'</td>' for v in row)+'</tr>' for row in rows)+'</table>')
def picture(name,caption):
    file='images/expanded/'+name
    q=doc.add_paragraph();q.paragraph_format.keep_with_next=True;q.paragraph_format.space_after=Pt(0)
    q.add_run().add_picture(str(OUT/file),width=Inches(6.5))
    for dp in q._p.xpath('.//wp:docPr'):dp.set('descr',caption)
    doc.add_paragraph(caption,'Caption');parts.append('<figure><img src="'+file+'" alt="'+html.escape(caption,quote=True)+'"><figcaption>'+html.escape(caption)+'</figcaption></figure>')

p('AI Teacher Matching\nUser Manual','Title')
p('JEN Academia','Subtitle')
p('Follow the examples below to request a teacher recommendation and understand the result you should see.')
p('The named examples use the prepared eight-teacher sample set shown in the screenshots. Ask the school administrator to confirm that this sample set is available on your site before comparing teacher names.')
p('The sample teacher accounts and all five learner examples are listed in the reference tables at the end of this manual.')
h('1. Sign in')
p('Open the JEN Academia website and sign in using the account provided by the school. From the administrator menu, select Create Student.')
p('If Create Student is not available in your account, ask the school administrator to assist you.')
h('2. Select the course')
p('Choose Conversational English. For these examples, leave Level Evaluation unscored and Preferred Class Time blank. Leave Assigned Teacher at Select Teacher.')
h('3. Enter the learner’s preferences')
p('Start with a learner who wants conversation practice and needs a slower pace. Under Matching Criteria, select only these choices:')
p('Learning Goal: Conversation (may be labeled Conversational English).')
p('Focus Area: Speaking.')
p('Learning Style: Conversational Practice.')
p('Learning Pace: Slow and Guided (may be labeled Guided Pace).')
p('Leave Trial Class Notes empty for this first example. Clear any other selected choices.')

h('Selecting matching preferences',True)
picture('DEMO-01-inputs.png','Figure 1. Matching preferences on the Create Student page. Screenshots use fictional sample data.')
h('4. Analyze the match')
p('Leave Assigned Teacher at Select Teacher to request a recommendation. Click Analyze with AI and wait for the result.')
p('The system compares the learner’s needs with the available teacher profiles and displays a recommended teacher with an explanation.')
h('Expected result: guided conversation')
p('With the prepared sample profiles in rule-based mode, the recommendation is Jamie Demo with a Strong match and 4 of 4 criteria covered. Jamie teaches speaking and conversation, uses a conversational style, and supports a slow pace.')
p('The result should agree with all four choices you selected. If live AI recommends another teacher, review whether that teacher’s profile and explanation support the same needs; the name alone does not establish whether the AI worked.')

h('Reviewing the recommendation',True)
picture('DEMO-01-result.png','Figure 2. A recommended teacher and matching explanation. This example shows a rule-based result.')
h('5. Review and select the teacher')
p('Read the teacher’s name, matching explanation and any warnings. A strong match covers all selected categories. A partial or weak match means some preferences are not covered.')
p('The recommended teacher appears in Assigned Teacher. Keep the recommendation or choose another available teacher from the list.')
p('If the page says AI is unavailable or not configured, this result shows rule-based matching. It does not show that live AI has processed the request.')

h('6. Change the needs and compare',True)
p('Open a fresh Create Student page so the previous teacher is not carried over. Choose Conversational English, leave Assigned Teacher unselected, and keep the level, preferred time and notes blank.')
p('Select Conversation as the goal, Speaking as the focus, Interactive Activities as the learning style, and Fast-paced (or Accelerated Pace) as the pace. Click Analyze with AI.')
p('Expected result with the prepared sample profiles in rule-based mode: Casey Demo, Strong match, 4 of 4 criteria covered. Casey supports speaking through interactive activities at a fast pace. This differs from Jamie’s slow, conversational approach.')
picture('DEMO-04-result.png','Figure 3. The second example recommends Casey Demo for interactive, fast-paced speaking practice. This reference capture uses rule-based matching.')
p('Compare the explanations in both examples. They should reflect the changed learning style and pace. Live AI may choose another suitable teacher when it provides a supported explanation.')

h('7. See whether AI understands the notes',True)
p('Open another fresh Create Student page and choose Conversational English. Leave the matching choices, level and preferred time blank. Keep Assigned Teacher at Select Teacher.')
p('In Trial Class Notes, enter: “The learner wants everyday speaking practice, prefers learning through conversation, and needs slow, guided explanations.”')
p('Click Analyze with AI. When live AI is available, look for suggested matching choices supported by the note, such as Conversation, Speaking, Conversational Practice and a guided pace. The exact combination can vary.')
h('What you should see')
p('The added choices should describe the learner’s needs, and the recommended teacher’s explanation should connect to those needs. Jamie Demo is a suitable reference teacher for this note in the prepared sample set, although another teacher may also be suitable.')
p('Look separately at the note suggestions and the ranking explanation. Added choices show that the AI interpreted the note. A live AI ranking explanation shows that AI helped order the teacher recommendations. One may work while the other is unavailable.')
p('If no choices are added, this example has not demonstrated note interpretation. If the page reports AI unavailable or not configured, ask the school administrator to check AI availability, then repeat this step.')
p('A teacher name or a Strong match label by itself is not proof that live AI ran. Review the AI messages and explanations shown on the page.')
h('8. Finish with your chosen teacher')
p('Complete the required student information and class package details. Review the selected teacher, then click Create Student to save the account. Analyzing the match alone does not save an account or book a lesson.')
p('For these sample walkthroughs, you can leave without saving. When enrolling an actual learner, use their real needs and information. Sign out when finished on a shared device.')

h('Sample teacher accounts',True)
p('Use these profiles to understand the recommendations in the walkthroughs. All eight are assigned to Conversational English in the reference sample set.')
table(['Teacher / sample email','Specialization','Teaching style / pace','Experience / active students'],[
    [t['first_name']+' '+t['last_name']+'\n'+t['email'],t['specialization'].replace(', ','; '),t['style'].capitalize()+' / '+{'slow':'Slow and guided','balanced':'Balanced','fast':'Fast-paced','review-heavy':'Review-heavy'}[t['pace']],str(t['experience_years'])+' years / '+str(t['assigned_student_count'])]
    for t in sample_data['teachers']
],[2500,2600,2460,1800])
p('Jamie supports slow conversation practice, while Casey supports faster speaking activities. Alex focuses on listening and pronunciation through visual learning. Sam combines news discussion with speaking. Riley supports structured pronunciation review.')
p('Active students means the number of learners already assigned to the teacher. This can affect which teacher is recommended.')
p('Sample emails identify the fictional reference accounts. Sign in with the administrator credentials supplied by the school; these entries are not login instructions. The school confirms which sample records are available on the deployed site.')

h('Sample learner examples and expected matches',True)
p('For each example, choose Conversational English and start on a fresh Create Student page. Leave Assigned Teacher unselected, the level unscored, and the preferred time and notes blank. Select only the choices listed below, then click Analyze with AI.')
labels={'conversation':'Conversation','confidence':'Confidence Building','news-discussion':'News Discussion','speaking':'Speaking','listening':'Listening','pronunciation':'Pronunciation','conversational':'Conversational Practice','visual':'Visual Learning','interactive':'Interactive Activities','structured':'Structured Lessons','slow':'Slow and guided','balanced':'Balanced','fast':'Fast-paced','review-heavy':'Review-heavy'}
table(['Learner','Goal / focus','Style / pace','Expected teacher','Coverage'],[
    [r['student'],labels[r['goal']]+' / '+labels[r['focus']],labels[r['style']]+' / '+labels[r['pace']],r['result']['teacher']['first_name']+' '+r['result']['teacher']['last_name'],str(r['result']['matchStrength']['matched'])+'/4']
    for r in sample_data['records']
],[1520,2660,2420,1700,1060])
p('These expected names and coverage counts apply to the prepared sample profiles in rule-based mode. Live AI can recommend another suitable teacher; compare the explanation with the learner’s selected needs.')
p('Lea, Mia and Ethan have examples that cover all four matching categories. Noah and Zoe have partial matches: their suggested teachers support the chosen skill, style and pace, but do not match the Confidence Building goal through their listed specialization.')
p('The learner names identify example profiles. You can enter their preferences in the matching page without creating duplicate student accounts.')

target=OUT/'AI_Teacher_Matching_User_Manual_With_Sample_Accounts.docx';doc.save(target)
assert audit_docx_tables(target)==0
with ZipFile(target) as z:assert z.testzip() is None
assert len(doc.inline_shapes)==3
# Preserve earlier links when their files are not locked by an open Word window.
for alias in ['AI_Teacher_Matching_User_Manual_With_Examples.docx','AI_Teacher_Matching_User_Manual.docx','AI_Teacher_Matching_User_Guide.docx','AI_Teacher_Matching_Testing_Guide.docx']:
    try:
        (OUT/alias).write_bytes(target.read_bytes())
    except PermissionError:
        print('Open document left in place: '+alias+'; use User_Manual_With_Sample_Accounts.docx.')
parts.append('</body></html>')
manual_html=''.join(parts).replace('AI Teacher Matching — Simple User Guide','AI Teacher Matching — User Manual').replace('AI_Teacher_Matching_User_Guide.docx',target.name).replace('Download editable Word guide','Download editable Word manual')
for name in ['AI_Teacher_Matching_Validation.html','AI_Teacher_Matching_Testing_Guide.html','AI_Teacher_Matching_User_Guide.html','AI_Teacher_Matching_User_Manual.html']:
    (OUT/name).write_text(manual_html,encoding='utf-8')
qa={'document':target.name,'tables':len(doc.tables),'screenshots':3,'plannedPages':7,'tableGeometry':'pass','visualRendering':'pending'}
(OUT/'user-guide-structural-qa.json').write_text(json.dumps(qa,indent=2),encoding='utf-8')
print(target)
