import boundaries from '../data/mx/municipal-boundaries.json' with { type: 'json' };
import catalog from '../data/mx/municipalities.json' with { type: 'json' };

const SCALE=boundaries.coordinateScale;
const stateNames=new Map(catalog.states.map(state=>[state.id,state.name]));

export function decodePolyline(encoded){
 if(typeof encoded!=='string'||!encoded||encoded.length>2_000_000)return null;
 const points=[];let index=0,lat=0,lng=0;
 const delta=()=>{let result=0,shift=0,byte;do{if(index>=encoded.length||shift>30)throw new Error('INVALID_POLYLINE');byte=encoded.charCodeAt(index++)-63;if(byte<0||byte>63)throw new Error('INVALID_POLYLINE');result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return result&1?~(result>>1):result>>1;};
 try{while(index<encoded.length){lat+=delta();lng+=delta();if(Math.abs(lat)>9_000_000||Math.abs(lng)>18_000_000)return null;points.push([lng/SCALE,lat/SCALE]);}}catch{return null;}
 return points.length>=2&&points.length<=200_000?points:null;
}

function decodeRing(encoded){
 const points=[];let index=0,x=0,y=0;
 const delta=()=>{let result=0,shift=0,byte;do{if(index>=encoded.length||shift>30)throw new Error('INVALID_BOUNDARY');byte=encoded.charCodeAt(index++)-63;result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return result&1?~(result>>1):result>>1;};
 while(index<encoded.length){x+=delta();y+=delta();points.push([x/SCALE,y/SCALE]);}
 return points;
}

function pointInRing([x,y],ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,yi]=ring[i],[xj,yj]=ring[j];
  if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}

function pointInPolygon(point,polygon){
 return pointInRing(point,polygon[0])&&!polygon.slice(1).some(hole=>pointInRing(point,hole));
}

function orientation(a,b,c){const value=(b[1]-a[1])*(c[0]-b[0])-(b[0]-a[0])*(c[1]-b[1]);return Math.abs(value)<1e-12?0:value>0?1:2;}
function onSegment(a,b,c){return b[0]<=Math.max(a[0],c[0])+1e-12&&b[0]>=Math.min(a[0],c[0])-1e-12&&b[1]<=Math.max(a[1],c[1])+1e-12&&b[1]>=Math.min(a[1],c[1])-1e-12;}
function segmentsIntersect(a,b,c,d){
 const o1=orientation(a,b,c),o2=orientation(a,b,d),o3=orientation(c,d,a),o4=orientation(c,d,b);
 return (o1!==o2&&o3!==o4)||(o1===0&&onSegment(a,c,b))||(o2===0&&onSegment(a,d,b))||(o3===0&&onSegment(c,a,d))||(o4===0&&onSegment(c,b,d));
}
function boxesIntersect(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}

function firstIntersection(points,row){
 const bbox=row.bbox.map(value=>value/SCALE);
 const polygons=row.polygons.map(polygon=>polygon.map(decodeRing));
 for(let index=0;index<points.length-1;index++){
  const start=points[index],end=points[index+1];
  const segmentBox=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.max(start[0],end[0]),Math.max(start[1],end[1])];
  if(!boxesIntersect(segmentBox,bbox))continue;
  for(const polygon of polygons){
   if(pointInPolygon(start,polygon)||pointInPolygon(end,polygon))return index;
   for(const ring of polygon)for(let edge=0;edge<ring.length-1;edge++)if(segmentsIntersect(start,end,ring[edge],ring[edge+1]))return index;
  }
 }
 return -1;
}

export function identifyMunicipalities(encoded){
 const points=decodePolyline(encoded);
 if(!points)return {status:'unresolved',municipalities:[],reason:'INVALID_ROUTE_GEOMETRY'};
 const routeBox=[Infinity,Infinity,-Infinity,-Infinity];
 for(const point of points){routeBox[0]=Math.min(routeBox[0],point[0]);routeBox[1]=Math.min(routeBox[1],point[1]);routeBox[2]=Math.max(routeBox[2],point[0]);routeBox[3]=Math.max(routeBox[3],point[1]);}
 const matches=[];
 for(const row of boundaries.municipalities){
  const bbox=row.bbox.map(value=>value/SCALE);
  if(!boxesIntersect(routeBox,bbox))continue;
  const first=firstIntersection(points,row);
  if(first>=0)matches.push({id:row.id,name:row.name,stateId:row.state,state:stateNames.get(row.state)||row.state,firstGeometryIndex:first});
 }
 matches.sort((a,b)=>a.firstGeometryIndex-b.firstGeometryIndex||a.id.localeCompare(b.id));
 return {status:matches.length?'identified_approximate':'unresolved',municipalities:matches,reason:matches.length?null:'NO_MEXICO_INTERSECTION'};
}

export function boundaryProvenance(){
 return {source:boundaries.source,sourceDescription:boundaries.sourceDescription,retrievedAt:boundaries.retrievedAt,toleranceDegrees:boundaries.toleranceDegrees,coordinateScale:SCALE,municipalityCount:boundaries.municipalities.length,use:boundaries.use};
}
