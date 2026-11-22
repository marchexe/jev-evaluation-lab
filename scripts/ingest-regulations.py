"""Re-extract the reviewed source edition, offline. No OCR, network or model calls.

python scripts/ingest-regulations.py --input data/local/regulatory --out results/regulatory-reingest
Requires tools listed in regulatory-requirements.txt. Existing outputs are never replaced.
New editions/clauses need a separate reviewed corpus rather than changing these pins.
"""
import argparse, copy, hashlib, json, pathlib
import pypdf

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf8')

def main():
    root=pathlib.Path(__file__).resolve().parents[1]
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=pathlib.Path,default=root/'data/local/regulatory',help='Original PDF directory (default: data/local/regulatory).')
    parser.add_argument('--out',type=pathlib.Path,required=True)
    args=parser.parse_args()
    corpus=json.loads((root/'examples/regulatory/corpus.json').read_text(encoding='utf8'))
    if pypdf.__version__!='7.1.0':
        raise ValueError('Use pinned pypdf 7.1.0 for reproducible extraction.')
    if args.out.exists():
        raise ValueError('Output already exists. Choose a new directory.')
    rebuilt=copy.deepcopy(corpus)
    for source in rebuilt['sources']:
        file=args.input/source['filename']
        if hashlib.sha256(file.read_bytes()).hexdigest()!=source['sha256']:
            raise ValueError('Different source edition: '+source['filename'])
        pdf=pypdf.PdfReader(file)
        if len(pdf.pages)!=source['pageCount']:
            raise ValueError('Changed page count: '+source['filename'])
        for page in [p for p in rebuilt['pages'] if p['sourceId']==source['id']]:
            text=pdf.pages[page['page']-1].extract_text() or ''
            digest=hashlib.sha256(text.encode()).hexdigest()
            if digest!=page['sha256'] or text!=page['text']:
                raise ValueError('Changed extraction: '+page['id'])
            for citation in [c for c in rebuilt['citations'] if c['pageId']==page['id']]:
                # JS/TypeScript passage offsets use UTF-16 code units.
                quote=text.encode('utf-16-le')[citation['start']*2:citation['end']*2].decode('utf-16-le')
                if quote!=citation['quote']:
                    raise ValueError('Incorrect citation: '+citation['id'])
    expected=rebuilt.pop('fingerprint')
    if hashlib.sha256(canonical(rebuilt)).hexdigest()!=expected:
        raise ValueError('Corpus fingerprint differs.')
    rebuilt['fingerprint']=expected
    args.out.mkdir(parents=True)
    (args.out/'corpus.json').write_text(json.dumps(rebuilt,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (args.out/'verification.json').write_text(json.dumps({'status':'passed','sources':len(rebuilt['sources']),'pages':len(rebuilt['pages']),'citations':len(rebuilt['citations']),'fingerprint':expected},indent=2)+'\n',encoding='utf8')
    print('Verified all 8 PDFs and 8 exact page citations. No API requests.')

if __name__=='__main__':
    main()
