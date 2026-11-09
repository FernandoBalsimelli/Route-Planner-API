"""Refresh official INEGI names and codes. These are not traffic permissions."""
import json, urllib.request, concurrent.futures, pathlib, datetime
BASE='https://gaia.inegi.org.mx/wscatgeo/v2/'
def read(path):
 with urllib.request.urlopen(BASE+path, timeout=25) as r: return json.load(r)['datos']
states=read('mgee')
def municipalities(state):
 rows=read('mgem/'+state['cvegeo'])
 return [dict(id=r['cvegeo'],name=r['nomgeo'],state=state['cvegeo']) for r in rows]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 groups=list(pool.map(municipalities,states))
rows=sorted([r for group in groups for r in group],key=lambda r:r['id'])
assert len(states)==32 and len(rows)>2400 and len({r['id'] for r in rows})==len(rows)
assert next(r for r in rows if r['id']=='19039')['name']=='Monterrey'
data={'source':BASE,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'states':[{'id':s['cvegeo'],'name':s['nomgeo']} for s in states],'municipalities':rows}
path=pathlib.Path('data/mx/municipalities.json');path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'states':len(states),'municipalities':len(rows),'bytes':path.stat().st_size}))
