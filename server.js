// Neon Arena multiplayer server - zero dependencies. Run: node server.js
// Serves the game at / and the multiplayer API at /api/*. Port: PORT env or 3000.
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000,GAME=path.join(__dirname,'Neon_Arena2.html');
const NMAPS=7,ARENA=40,RESPAWN_MS=3000,IDLE_MS=15000,MAX_PER_ROOM=12;
const rooms={};let nextId=1;
const num=(v,d)=>Number.isFinite(+v)?+v:d;
function spawn(){const a=Math.random()*Math.PI*2,r=ARENA*.6;return{x:+(Math.sin(a)*r).toFixed(2),z:+(Math.cos(a)*r).toFixed(2)}}
function room(n){return rooms[n]||(rooms[n]={seq:0,players:{},ev:[],th:0,tv:0})}
function push(r,e){e.n=++r.seq;r.ev.push(e);if(r.ev.length>200)r.ev.splice(0,r.ev.length-200)}
function me(p){return{rs:p.rs,x:p.sx,z:p.sz,hp:p.hp,k:p.k,d:p.d}}
function handle(path_,b){
  if(path_=='join'){
    const name=String(b.name||'Player').replace(/[<>]/g,'').slice(0,14)||'Player',rn=String(b.room||'LOBBY').slice(0,12)||'LOBBY',r=room(rn);
    if(Object.keys(r.players).length>=MAX_PER_ROOM)return{error:'Room is full'};
    const sp=spawn(),id=nextId++;
    r.players[id]={id,name,model:b.model&&typeof b.model=='object'?b.model:{},x:sp.x,y:0,z:sp.z,yaw:Math.atan2(sp.x,sp.z),pitch:0,w:0,hp:100,k:0,d:0,rs:1,sx:sp.x,sz:sp.z,dead:0,vote:-1,seen:Date.now()};
    return{id,room:rn,seq:r.seq,th:r.th,tv:r.tv,me:me(r.players[id])};
  }
  const r=rooms[b.room],p=r&&r.players[b.id];
  if(path_=='leave'){if(p){delete r.players[b.id];if(!Object.keys(r.players).length)delete rooms[b.room]}return{ok:1}}
  if(path_!='sync')return{error:'Bad request'};
  if(!p)return{error:'Not in room'};
  const now=Date.now();p.seen=now;
  if(p.hp<=0&&p.dead&&now>=p.dead){const sp=spawn();p.hp=100;p.dead=0;p.rs++;p.sx=p.x=sp.x;p.sz=p.z=sp.z;p.y=0}
  if(p.hp>0&&b.s){const s=b.s;p.x=Math.max(-ARENA,Math.min(ARENA,num(s.x,p.x)));p.y=Math.max(0,Math.min(30,num(s.y,p.y)));p.z=Math.max(-ARENA,Math.min(ARENA,num(s.z,p.z)));p.yaw=num(s.yaw,p.yaw);p.pitch=num(s.pitch,p.pitch);if(s.w===0||s.w===1||s.w===2)p.w=s.w}
  if(p.hp>0&&Array.isArray(b.shots))for(const s of b.shots.slice(0,12)){
    if(!Array.isArray(s.o)||!Array.isArray(s.e))continue;
    push(r,{t:'shot',id:p.id,o:s.o.slice(0,3).map(v=>num(v,0)),e:s.e.slice(0,3).map(v=>num(v,0)),w:s.w|0,f:s.f?1:0})}
  if(p.hp>0&&Array.isArray(b.hits))for(const h of b.hits.slice(0,16)){
    const v=r.players[h.t];if(!v||v===p||v.hp<=0)continue;
    v.hp=Math.max(0,v.hp-Math.max(0,Math.min(60,num(h.dmg,0))));
    if(v.hp<=0){v.d++;p.k++;v.dead=now+RESPAWN_MS;push(r,{t:'kill',k:p.id,v:v.id,kn:p.name,vn:v.name})}}
  for(const id in r.players)if(now-r.players[id].seen>IDLE_MS)delete r.players[id];
  /* map vote: ignore stale votes (client has not seen the latest map change yet); a strict majority switches the room's map */
  if(b.tv===r.tv&&Number.isInteger(b.vote))p.vote=b.vote>=0&&b.vote<NMAPS?b.vote:-1;
  const pl=Object.values(r.players),votes=Array(NMAPS).fill(0);pl.forEach(q=>{if(q.vote>=0)votes[q.vote]++});
  const win=votes.findIndex(c=>c>pl.length/2);
  if(win>=0&&win!==r.th){r.th=win;r.tv++;pl.forEach(q=>q.vote=-1);votes.fill(0);push(r,{t:'theme',th:win})}
  const known=new Set((b.known||[]).map(Number)),since=num(b.since,0);
  const players=Object.values(r.players).map(q=>{const o={id:q.id,name:q.name,x:q.x,y:q.y,z:q.z,yaw:q.yaw,pitch:q.pitch,w:q.w,hp:q.hp,k:q.k,d:q.d};if(!known.has(q.id))o.model=q.model;return o});
  return{seq:r.seq,th:r.th,tv:r.tv,votes,np:pl.length,me:me(p),players,ev:r.ev.filter(e=>e.n>since)};
}
http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method=='OPTIONS'){res.writeHead(204);return res.end()}
  const u=req.url.split('?')[0];
  if(req.method=='POST'&&u.startsWith('/api/')){
    let d='';req.on('data',c=>{d+=c;if(d.length>2e5)req.destroy()});
    req.on('end',()=>{let out;try{out=handle(u.slice(5),JSON.parse(d||'{}'))}catch(e){out={error:'Bad request'}}
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(out))});return}
  if(u=='/'||u=='/index.html'){fs.readFile(GAME,(e,b)=>{if(e){res.writeHead(404);return res.end('Put Neon_Arena2.html next to server.js')}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(b)});return}
  res.writeHead(404);res.end('Not found');
}).listen(PORT,()=>console.log('Neon Arena server on http://localhost:'+PORT));
