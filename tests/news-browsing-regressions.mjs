import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path,imports,globals={}){
 const code=ts.transpileModule(fs.readFileSync(path,'utf8').replace(/import\.meta\.env\.BASE_URL/g,'"/"'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in imports,name);return imports[name];},URL,Date,Set,Map,Promise,console,...globals});return exports;
}
const identity=load('src/features/news/services/newsIdentity.ts',{});
const persisted=new Map();let fail=false;
const localStorage={getItem:key=>persisted.get(key)||null,removeItem:key=>persisted.delete(key),setItem:(key,value)=>{if(fail&&key==='raje3_news_tracker_v1'){fail=false;throw Error('quota');}persisted.set(key,value);}};
const storage=load('src/features/news/storage/newsStorage.ts',{'../services/newsIdentity':identity},{localStorage}).newsStorage;
const source={id:'one',name:'Source',url:'https://publisher.ma/',kind:'web',enabled:true,builtIn:true};
const article=(n,date='2026-10-01')=>({id:'a'+n,sourceId:'one',title:'A useful public news title '+n,url:'https://publisher.ma/news/'+n,publishedAt:date});
storage.saveArticles(Array.from({length:15},(_,i)=>article(i)),false);
assert.equal(storage.articles().length,15);
const before=new Map(persisted);fail=true;assert.throws(()=>storage.saveArticles([article(99,'2026-10-03'),...storage.articles()]));
assert.deepEqual(persisted,before,'A tracker write failure restores the complete browsing snapshot');
let fetched=[],cursorCalls=[],release;
const service=load('src/features/news/services/newsService.ts',{
 './newsBundle':load('src/features/news/services/newsBundle.ts',{}),
 './newsLanguage':{preferArabicArticles:items=>items},
 '../config/defaultSources':{DEFAULT_NEWS_SOURCES:[source,{...source,id:'two'}]},
 '../storage/newsStorage':{newsStorage:storage},
 '../providers/customProvider':{fetchNewsPage:async(s,cursor)=>{fetched.push(s.id);cursorCalls.push(cursor);if(release)await new Promise(resolve=>{release=resolve;});return {articles:[article(cursor?'older':'fresh')],next:cursor?undefined:'https://publisher.ma/page/2'};}},
 '../providers/sourceAccess':{publicNewsUrl:value=>new URL(value)},
},{fetch:async()=>({ok:true,json:async()=>({articles:[]})}),crypto:{randomUUID:()=> 'fixed'}}).newsService;
service.setSourcePreferences('one',{enabled:false});await service.refresh();assert.deepEqual(fetched,['two'],'Disabled source is not polled');
fetched=[];await service.refresh('one');assert.deepEqual(fetched,['one'],'Explicitly opening a disabled source fetches only it');
service.setSourcePreferences('two',{notificationsEnabled:false});fetched=[];await service.refresh();assert.equal(fetched.length,0,'Muted sources are not periodically polled');
assert.equal(service.sources().find(s=>s.id==='two').enabled,true,'Muting keeps the source visible');
service.removeSource('one');assert.equal(service.sources().length,2,'Built-in source cannot be deleted');
cursorCalls=[];assert.equal(await service.loadOlder('one'),true);assert.equal(await service.loadOlder('one'),false);assert.equal(await service.loadOlder('one'),false);assert.deepEqual(cursorCalls,[undefined,'https://publisher.ma/page/2'],'Pagination follows the announced next page once and stops');
const oldCount=storage.pendingNewArticles().length;storage.saveArticles([...storage.articles(),article('archive','2020-01-01')],false);assert.equal(storage.pendingNewArticles().length,oldCount,'Browsing older pages does not queue notifications');
console.log('News preferences, transactional recovery, manual fetching and pagination checks passed');
