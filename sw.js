/* RYXX Expansietracker – service worker: app offline, kaartdelen bewaard, updates bij verbinding */
const SHELL='ryxx-shell', DATA='ryxx-data', SHELL_FILES=['index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES.map(f=>new Request(f,{cache:'reload'}))))); self.skipWaiting(); });
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
const rel=u=>{ const x=new URL(u); return x.pathname.split('/').pop()?x.pathname.replace(self.registration.scope.replace(location.origin,''),'')+x.search:'index.html'; };
async function checkUpdate(){ try{
    const v=await fetch('version.txt',{cache:'no-store'}).then(r=>r.ok?r.text():null); if(!v) return;
    const c=await caches.open(SHELL), old=await c.match('version.txt').then(r=>r?r.text():null);
    if(old===v.trim()) return;
    await Promise.all(SHELL_FILES.map(f=>fetch(f,{cache:'no-store'}).then(r=>{ if(r.ok) return c.put(f,r); })));
    await c.put('version.txt',new Response(v.trim()));
    if(old!==null) (await self.clients.matchAll()).forEach(cl=>cl.postMessage({t:'updated'}));
  }catch(e){} }
self.addEventListener('fetch',e=>{ const u=new URL(e.request.url); if(u.origin!==location.origin||e.request.method!=='GET') return;
  const r=rel(e.request.url);
  if(e.request.mode==='navigate'||r==='index.html'||r===''){ e.respondWith(caches.open(SHELL).then(c=>c.match('index.html')).then(hit=>{ e.waitUntil(checkUpdate()); return hit||fetch(e.request); })); return; }
  if(u.searchParams.has('v')){ e.respondWith(caches.open(DATA).then(async c=>{ const hit=await c.match(e.request); if(hit) return hit; const res=await fetch(e.request); if(res.ok) c.put(e.request,res.clone()); return res; })); return; }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));
});
async function count(all,src,t){ const c=await caches.open(DATA), keys=new Set((await c.keys()).map(k=>rel(k.url))); let have=0; for(const a of all) if(keys.has(a)) have++;
  let mb=0; try{ const est=await navigator.storage.estimate(); mb=Math.round(est.usage/1e6); }catch(e){}
  src.postMessage({t:t||'count',have,total:all.length,mb}); return keys; }
self.addEventListener('message',e=>{ const m=e.data||{}, src=e.source;
  if(m.t==='cleanup') e.waitUntil(caches.open(DATA).then(async c=>{ const keep=new Set(m.keep); for(const k of await c.keys()) if(!keep.has(rel(k.url))) await c.delete(k); }));
  if(m.t==='count') e.waitUntil(count(m.all,src));
  if(m.t==='fetchAll') e.waitUntil((async()=>{ const c=await caches.open(DATA); const keys=await count(m.all,src,'progress'); const todo=m.all.filter(a=>!keys.has(a)); let done=m.all.length-todo.length, i=0, last=0;
    const worker=async()=>{ while(i<todo.length){ const a=todo[i++]; try{ const r=await fetch(a); if(r.ok){ await c.put(a,r); done++; } }catch(err){ src.postMessage({t:'error',msg:'geen verbinding'}); i=todo.length; return; }
        if(Date.now()-last>700){ last=Date.now(); src.postMessage({t:'progress',have:done,total:m.all.length}); } } };
    await Promise.all([worker(),worker(),worker(),worker()]); await count(m.all,src,'progress'); })());
});
