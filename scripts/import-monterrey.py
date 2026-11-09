"""Extract official annex tables without inventing road geometries or legal coverage."""
import sys,json,re,hashlib,datetime,pathlib,pdfplumber
path=pathlib.Path(sys.argv[1]);clean=lambda s:re.sub(r'\s+',' ',s or '').strip()
source='https://www.monterrey.gob.mx/pdf/portaln/reglamentos/Reglamento%20de%20Transito%20y%20Vialidad%20del%20Municipio%20de%20Monterrey.pdf'
def rowdata(row,page,annex):
 m=re.match(r'^(\d+)\.\s*(.+)',clean(row[0]))
 if not m or len(row)<2 or not row[1]:return None
 return {'sourceRow':int(m[1]),'road':m[2],'segment':clean(row[1]),'page':page,'annex':annex,'geometry':None,'geometryStatus':'not_validated'}
with pdfplumber.open(path) as pdf:
 trunk=[]
 for p in [162,163,164]:
  for table in pdf.pages[p].extract_tables():
   for row in table:
    item=rowdata(row,p+1,1)
    if item:trunk.append(item)
 assert [r['sourceRow'] for r in trunk]==list(range(1,39))
 schedules=[]
 def window(rows,page,annex,start,end,weekend=False):
  days=[6,7] if weekend else [1,2,3,4,5]
  for row in rows:
   item=rowdata(row,page,annex)
   if item:schedules.append({**item,'days':days,'start':start,'end':end,'timezone':'America/Monterrey','maximumAxlesExempt':None if weekend else 4,'interpretation': 'requires_review' if weekend else 'reference_only','interpretationNote':'El anexo incluye fin de semana; cotejar su aplicación con el artículo 39, que menciona lunes a viernes.' if weekend else 'La excepción del artículo 39 para hasta cuatro ejes se limita a sus restricciones horarias; no autoriza todas las calles.'})
 day=pdf.pages[165].extract_tables()[0];split=next(i for i,r in enumerate(day) if 'SÁBADOS' in clean(r[0]))
 window(day[:split],166,2,'06:30','09:30');window(day[split+1:],166,2,'12:00','14:00',True)
 window(pdf.pages[165].extract_tables()[1],166,3,'18:00','20:00')
 eve=pdf.pages[166].extract_tables()[0];split=next(i for i,r in enumerate(eve) if 'SÁBADOS' in clean(r[0]))
 window(eve[:split],167,3,'18:00','20:00');window(eve[split+1:],167,3,'18:00','21:00',True)
 assert len(schedules)==19
 data={'municipalityId':'19039','name':'Monterrey','country':'MX','status':'reference_only','routingEnforced':False,'source':{'url':source,'title':'Reglamento de Tránsito y Vialidad del Municipio de Monterrey','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pages':[20,21,22,163,164,165,166,167]},'trunkSegments':trunk,'timeRules':schedules,'notices':['Los nombres y tramos del documento no son geometrías verificadas para excluir calles del motor de rutas.','No se ha comprobado que el recorrido cruza estas vías ni que el operador dispone de permiso.','El anexo 3 repite dos entradas de Av. Revolución el fin de semana; se conservan como aparecen en la fuente.','La cobertura municipal de México está en construcción. Un municipio sin reglas cargadas no se considera libre de restricciones.']}
 pathlib.Path('data/mx/19039.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'trunkSegments':len(trunk),'timeRules':len(schedules),'routingEnforced':False}))
