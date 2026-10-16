"""Extract catalog photograph objects and associate labels using page coordinates."""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import json
import pdfplumber
from pypdf import PdfReader
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/catalog-photo-fill'
pdf=OUT/'pages/lily-catalog.pdf';reader=PdfReader(pdf);layout=pdfplumber.open(pdf)
records=[]
for page_number in [6,13,25,33]:
    pg=layout.pages[page_number-1];words=pg.extract_words();objects={im.indirect_reference.idnum:im for im in reader.pages[page_number-1].images}
    for position in pg.images:
        objid=position['stream'].objid;image=objects[objid]
        center=(position['x0']+position['x1'])/2
        label_words=[w for w in words if abs((w['x0']+w['x1'])/2-center)<55 and position['bottom']-1<=w['top']<=position['bottom']+45]
        label=' '.join(w['text'] for w in sorted(label_words,key=lambda w:(round(w['top']/8),w['x0'])))
        if page_number==6:pid='P064'
        elif 'OT hybrid' in label:pid='P061'
        elif 'Oriental hybrid' in label:pid='P059'
        elif 'Asiatic hybrid' in label:pid='P060'
        elif 'LA hybrid' in label:pid='P062'
        elif 'Longiflorum' in label:pid='P063'
        else:continue
        folder=OUT/'originals'/pid;folder.mkdir(parents=True,exist_ok=True)
        original=folder/f'vandenbos-page{page_number}-object{objid}{Path(image.name).suffix}'
        original.write_bytes(image.data)
        im=Image.open(BytesIO(image.data))
        # JP2 is decoded losslessly for browser compatibility; keep original PDF object bytes.
        display=original
        if original.suffix.lower()=='.jp2':
            display=original.with_suffix('.png');im.save(display)
        records.append({'productIds':[pid],'sourcePage':'https://www.vandenbos.com/en/catalogus-lily','sourceDocument':'https://www.vandenbos.com/media/wnenx4eg/vdb-flowerbulbs-catalogus-lily.pdf', 'sourceDocumentSha256':sha256(pdf.read_bytes()).hexdigest(),'sourcePageNumber':page_number,'sourceObjectId':objid,'sourceOrganization':'Van den Bos Flowerbulbs','author':'Van den Bos Flowerbulbs / individual photographer unspecified','license':'Catalog photo; reuse conditions not verified. Local reference only.','caption':label or 'Roselily (double-flowered lily), catalog page 6','mappingStatus':'category-reference-with-catalog-labelled-cultivar','localPath':display.relative_to(ROOT).as_posix(),'originalPath':original.relative_to(ROOT).as_posix(),'width':im.width,'height':im.height,'sha256':sha256(display.read_bytes()).hexdigest(),'mediaOrigin':'real-photo-candidate','reviewStatus':'pending-visual-review','sameSpecimenMultiView':False,'retrievedDate':'2026-10-14'})
(OUT/'lily-extracted.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('EXTRACTED',len(records));print([(x['productIds'][0],x['caption']) for x in records])
