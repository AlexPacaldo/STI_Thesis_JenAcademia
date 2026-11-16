"""Combine the four alpha documents, preserving native tables and list numbering."""
import copy
import html
import json
import re
from pathlib import Path
from zipfile import ZipFile
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'alpha-testing-ai-matching'
parts=[
 ('01_Alpha_Tester_Guide','Part 1: Alpha Tester Guide','part-1'),
 ('02_Sample_Student_and_Teacher_Profiles','Part 2: Sample Student and Teacher Profiles','part-2'),
 ('03_AI_Matching_Test_Cases','Part 3: AI Matching Test Cases','part-3'),
 ('04_Matching_Algorithm_Explanation','Part 4: Matching Algorithm Explanation','part-4'),
]
sources=[Document(OUT/(stem+'.docx')) for stem,_,_ in parts]
doc=Document(OUT/(parts[0][0]+'.docx'))
for element in list(doc.element.body):
    if element.tag!=qn('w:sectPr'):doc.element.body.remove(element)
doc.core_properties.title='AI Teacher Matching - Complete Alpha Testing Manual'
doc.core_properties.subject='Combined guide, sample accounts, nineteen cases and implementation explanation; questionnaire excluded'
doc.add_paragraph('AI Teacher Matching\nAlpha Testing Manual','Title')
doc.add_paragraph('Complete editable edition | 17 November 2026','Subtitle')
doc.add_paragraph('One manual for the three QA testers: how to use the feature, which sample profiles to enter, what outcomes to expect, and how the current code produces recommendations.')
doc.add_paragraph('Includes eight fictional teacher profiles, eight student assessments and nineteen cases. All deployed cases remain Not run. No accounts or database records were created by this package. The questionnaire is excluded.')
doc.add_paragraph('Contents','Heading 1')
for _,title,anchor in parts:
    p=doc.add_paragraph();link=OxmlElement('w:hyperlink');link.set(qn('w:anchor'),anchor)
    run=OxmlElement('w:r');rp=OxmlElement('w:rPr');color=OxmlElement('w:color');color.set(qn('w:val'),'2E74B5');rp.append(color);run.append(rp)
    text=OxmlElement('w:t');text.text=title;run.append(text);link.append(run);p._p.append(link)
doc.add_paragraph('Known implementation finding: the AI advisor expects a nested teacher profile that the recommendation route does not provide. Part 4 explains the impact. Exact rule-based predictions are kept separate from live AI acceptance conditions.')

def rewrite(text):
    for i in range(1,5):text=text.replace('Document '+str(i),'Part '+str(i)).replace('document '+str(i),'part '+str(i))
    return text.replace('How the four documents fit together','How this manual is organized').replace('in your own copy of Part 3','in your own copy of this manual').replace('separate copy of the test-case document','separate copy of this manual')

numbering=doc.part.numbering_part.element
next_abstract=max([int(n.get(qn('w:abstractNumId'))) for n in numbering.findall(qn('w:abstractNum'))],default=-1)+1
next_num=max([int(n.get(qn('w:numId'))) for n in numbering.findall(qn('w:num'))],default=0)+1
bookmark_id=100
for source,(_,title,anchor) in zip(sources,parts):
    abstracts={};nums={}
    # Every source gets its own list IDs so a procedure always restarts as authored.
    for node in source.part.numbering_part.element.findall(qn('w:abstractNum')):
        node=copy.deepcopy(node);old=node.get(qn('w:abstractNumId'));abstracts[old]=str(next_abstract);node.set(qn('w:abstractNumId'),str(next_abstract));next_abstract+=1;numbering.append(node)
    for node in source.part.numbering_part.element.findall(qn('w:num')):
        node=copy.deepcopy(node);old=node.get(qn('w:numId'));nums[old]=str(next_num);node.set(qn('w:numId'),str(next_num));next_num+=1
        for ref in node.findall(qn('w:abstractNumId')):ref.set(qn('w:val'),abstracts[ref.get(qn('w:val'))])
        numbering.append(node)
    first=True
    for original in source.element.body:
        if original.tag==qn('w:sectPr'):continue
        node=copy.deepcopy(original)
        # The authored source documents contain no images or linked body parts.
        assert not node.xpath('.//@r:id | .//@r:embed | .//@r:link'), 'Related parts need an explicit merge'
        for ref in node.xpath('.//w:numPr/w:numId'):
            old=ref.get(qn('w:val'))
            if old!='0':ref.set(qn('w:val'),nums[old])
        for text in node.xpath('.//w:t'):
            if text.text:text.text=rewrite(text.text)
        if first and node.tag==qn('w:p'):
            # A real top-level part heading, with subsections nested beneath it.
            ppr=node.find(qn('w:pPr'))
            if ppr is None:ppr=OxmlElement('w:pPr');node.insert(0,ppr)
            for child in list(ppr):ppr.remove(child)
            ps=OxmlElement('w:pStyle');ps.set(qn('w:val'),'Heading1');ppr.append(ps);ppr.append(OxmlElement('w:pageBreakBefore'))
            spacing=OxmlElement('w:spacing');spacing.set(qn('w:before'),'0');ppr.append(spacing)
            for child in list(node):
                if child.tag!=qn('w:pPr'):node.remove(child)
            start=OxmlElement('w:bookmarkStart');start.set(qn('w:id'),str(bookmark_id));start.set(qn('w:name'),anchor);node.append(start)
            run=OxmlElement('w:r');text=OxmlElement('w:t');text.text=title;run.append(text);node.append(run)
            end=OxmlElement('w:bookmarkEnd');end.set(qn('w:id'),str(bookmark_id));node.append(end);bookmark_id+=1;first=False
        else:
            for st in node.xpath('.//w:pStyle'):
                val=st.get(qn('w:val'))
                if val=='Heading1':st.set(qn('w:val'),'Heading2')
                elif val=='Heading2':st.set(qn('w:val'),'Heading3')
        doc.element.body.insert(len(doc.element.body)-1,node)

target=OUT/'AI_Teacher_Matching_Alpha_Testing_Manual.docx';doc.save(target)
assert len(doc.tables)==sum(len(s.tables) for s in sources)
text=' '.join(p.text for p in doc.paragraphs)
assert all('TC'+str(i).zfill(2) in text for i in range(1,20))
assert not re.search(r'\bDocument [1-4]\b',text)
with ZipFile(target) as z:
    assert z.testzip() is None
    assert b'part-4' in z.read('word/document.xml')

css='body{max-width:980px;margin:40px auto;padding:0 20px;font:16px/1.55 Arial;color:#21382f}h1,h2{color:#173d32}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #cbd5cd;padding:8px;text-align:left;vertical-align:top}th{background:#f2f4f7}li{margin-bottom:8px}section{margin:40px 0}'
contents='<h1>AI Teacher Matching — Alpha Testing Manual</h1><p><a href="'+target.name+'">Download the complete editable Word manual</a></p><p>Guide, eight teacher profiles, eight student assessments, nineteen cases and algorithm explanation in one manual. Questionnaire excluded. All deployed cases remain Not run.</p><nav><ol>'+''.join('<li><a href="#'+anchor+'">'+html.escape(title)+'</a></li>' for _,title,anchor in parts)+'</ol></nav>'
for stem,title,anchor in parts:
    source=(OUT/(stem+'.html')).read_text(encoding='utf-8')
    body=re.search(r'<body>([\s\S]*?)</body>',source).group(1)
    body=re.sub(r'^<p>[\s\S]*?</p>','',body,count=1)
    body=re.sub(r'^<p>[\s\S]*?</p>','<h1 id="'+anchor+'">'+html.escape(title)+'</h1>',body,count=1)
    contents+='<section>'+rewrite(body)+'</section>'
page='<!doctype html><html><head><meta charset="utf-8"><title>AI Teacher Matching Alpha Testing Manual</title><style>'+css+'</style></head><body>'+contents+'</body></html>'
(OUT/'AI_Teacher_Matching_Alpha_Testing_Manual.html').write_text(page,encoding='utf-8')
(OUT/'index.html').write_text(page,encoding='utf-8')
(ROOT/'docs/matching-evidence/AI_Teacher_Matching_Validation.html').write_text(page.replace('href="'+target.name+'"','href="../../alpha-testing-ai-matching/'+target.name+'"'),encoding='utf-8')
qa={'document':target.name,'sourceParts':4,'tables':len(doc.tables),'teacherProfiles':8,'studentProfiles':8,'testCases':19,'linkedContents':True,'numbering':'remapped per source document','questionnaire':'excluded','structuralCheck':'pass','visualRendering':'pending'}
(OUT/'combined-document-qa.json').write_text(json.dumps(qa,indent=2),encoding='utf-8')
(OUT/'README.md').write_text('# AI Teacher Matching alpha manual\n\nOpen **AI_Teacher_Matching_Alpha_Testing_Manual.docx** for the complete editable manual. It combines the guide, sample profiles, test cases and algorithm explanation. The questionnaire is excluded.\n\nAll deployed cases remain Not run. No accounts were inserted and no application/database behavior was changed. The earlier component documents are retained as source material. `index.html` and the active validation HTML show the combined manual.\n',encoding='utf-8')
print(target)
print('Combined four parts; preserved '+str(len(doc.tables))+' tables and all 19 test cases.')
