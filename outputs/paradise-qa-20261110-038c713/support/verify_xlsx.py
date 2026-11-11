from pathlib import Path
from zipfile import ZipFile
import json
import xml.etree.ElementTree as ET

base=Path(__file__).resolve().parent.parent
book=base/'Paradise-Full-Project-QA-Test-Cases.xlsx'
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(book) as z:
    assert z.testzip() is None
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns):
            shared.append(''.join(t.text or '' for t in si.findall('.//s:t',ns)))
    def value(cell):
        if cell is None:return None
        t=cell.get('t');v=cell.find('s:v',ns)
        if t=='inlineStr':return ''.join(n.text or '' for n in cell.findall('.//s:t',ns))
        if v is None:return None
        if t=='s':return shared[int(v.text)]
        return v.text
    sheets=ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',ns)
    assert [s.get('name') for s in sheets]==['Start here','Test cases','Coverage','Automation map','Fixtures','Acceptance inputs']
    t=ET.fromstring(z.read('xl/worksheets/sheet2.xml'))
    cells={c.get('r'):c for c in t.findall('.//s:sheetData/s:row/s:c',ns)}
    ids=[value(cells.get(f'A{r}')) for r in range(7,879)]
    assert len(ids)==872 and len(set(ids))==872
    for r in range(7,879):
        for col in ['A','B','C','D','E','F','G','H','I','J','R']:
            assert value(cells.get(f'{col}{r}')),f'Missing {col}{r}'
        assert value(cells.get(f'K{r}'))=='NOT RUN'
        assert value(cells.get(f'S{r}'))=='Awaiting execution'
        for col in ['L','M','N','O','P','Q']:
            assert value(cells.get(f'{col}{r}')) in (None,''),f'Temporary evidence leaked {col}{r}'
    pane=t.find('s:sheetViews/s:sheetView/s:pane',ns)
    assert pane is not None and pane.get('xSplit')=='2' and pane.get('ySplit')=='6',str(pane.attrib if pane is not None else None)
    dvs=t.findall('s:dataValidations/s:dataValidation',ns)
    assert any(d.get('sqref')=='K7:K878' for d in dvs)
    s=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    sc={c.get('r'):c for c in s.findall('.//s:sheetData/s:row/s:c',ns)}
    assert value(sc['B7'])=='872' and value(sc['B12'])=='872'
    assert value(sc['B9'])=='0' and value(sc['B10'])=='0' and value(sc['B14'])=='0'
    areas=[int(value(sc[f'B{r}'])) for r in range(20,56)]
    assert sum(areas)==872
    tables=[p for p in z.namelist() if p.startswith('xl/tables/table') and p.endswith('.xml')]
    assert len(tables)==7
    errors=[]
    for p in z.namelist():
        if p.startswith('xl/worksheets/sheet') and p.endswith('.xml'):
            for c in ET.fromstring(z.read(p)).findall('.//s:c',ns):
                if c.get('t')=='e':errors.append([p,c.get('r'),value(c)])
    assert not errors,errors
    a=ET.fromstring(z.read('xl/worksheets/sheet4.xml'))
    ac={c.get('r'):c for c in a.findall('.//s:sheetData/s:row/s:c',ns)}
    assert value(ac['F7'])=='Authorization and company isolation'
    for r in range(7,564):assert value(ac.get(f'I{r}'))=='NOT RUN'
    result={'xlsx_integrity':'PASS','sheets':len(sheets),'case_rows':872,'unique_ids':'PASS','all_cases_not_run':'PASS','temporary_evidence_cleared':'PASS','steps_and_expected_results_present':'PASS','summary_and_area_counts':'PASS','status_validation':'PASS','frozen_headers_and_ids':'PASS','native_tables':len(tables),'formula_error_cells':len(errors),'automation_rows':557,'bytes':book.stat().st_size}
    (base/'support'/'saved-file-verification.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
