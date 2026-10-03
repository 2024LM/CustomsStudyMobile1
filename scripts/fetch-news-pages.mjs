import { mkdir, writeFile } from 'node:fs/promises';
import { newsEngine } from './news-engine.mjs';

const engine=await newsEngine();
const output=new URL('../public/news-pages/',import.meta.url);
await mkdir(output,{recursive:true});
const MAX_PAGES=8; // Bound build traffic; preserve the real next link beyond the snapshot.
const results=await Promise.all(engine.DEFAULT_NEWS_SOURCES.map(async source=>{
  const documents=new Map(),visited=new Set();
  const readDocument=url=>{
    if(!documents.has(url))documents.set(url,engine.newsDocument(url));
    return documents.get(url);
  };
  let cursor={url:source.feedUrl||source.url},count=0;
  try{
    for(;count<MAX_PAGES&&cursor;count++){
      const identity=engine.cursorIdentity(cursor);
      if(visited.has(identity))break;
      visited.add(identity);
      const page=await engine.fetchNewsPage(source,cursor,readDocument);
      await writeFile(new URL(engine.archivePageKey(cursor)+'.json',output),JSON.stringify({
        schemaVersion:1,sourceUrl:engine.publicNewsUrl(source.url).href,request:identity,generatedAt:new Date().toISOString(),...page,
      }));
      cursor=page.next;
    }
    return {sourceId:source.id,pages:count,next:cursor};
  }catch(error){
    // A partial publisher outage must not be labelled as the end of its archive.
    return {sourceId:source.id,pages:count,error:error instanceof Error?error.message:String(error)};
  }
}));
console.log(JSON.stringify(results,null,2));
if(results.every(result=>result.pages===0))process.exitCode=1;
