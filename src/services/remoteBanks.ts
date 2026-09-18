export interface RemoteBankItem {
  id: string;
  name: string;
  description: string;
  downloadUrl: string;
  version: string;
}
const SHEET_ID = '1C20YbXadWaMSaHimzbxucd8Cq10P67KJVmPROc2ZxAk';
const SHEET_NAME = 'Sheet1';
const INDEX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const CACHE_KEY = 'customs_remote_banks_v1';
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=ch;}
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);} return rows;
}
function normalize(rows:string[][]):RemoteBankItem[]{
  if(rows.length<2)return[];const h=rows[0].map(v=>v.trim()),at=(n:string)=>h.indexOf(n);
  const req=['ID','اسم البنك','وصف مختصر','رابط التحميل','الإصدار'];if(req.some(x=>at(x)<0))throw new Error('صيغة فهرس البنوك غير متوافقة.');
  const seen=new Set<string>();
  return rows.slice(1).map(r=>({id:(r[at('ID')]||'').trim(),name:(r[at('اسم البنك')]||'').trim(),description:(r[at('وصف مختصر')]||'').trim(),downloadUrl:(r[at('رابط التحميل')]||'').trim(),version:(r[at('الإصدار')]||'').trim()})).filter(x=>{if(!x.id||!x.name||!/^https:\/\//i.test(x.downloadUrl)||seen.has(x.id))return false;seen.add(x.id);return true;});
}
export async function fetchRemoteBanks(force=false):Promise<{items:RemoteBankItem[];cached:boolean}>{
  if(!force){try{const raw=localStorage.getItem(CACHE_KEY);if(raw){const p=JSON.parse(raw);if(Array.isArray(p.items)&&Date.now()-Number(p.savedAt||0)<15*60*1000)return{items:p.items,cached:true};}}catch{}}
  try{const res=await fetch(INDEX_URL,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);const items=normalize(parseCsv(await res.text()));localStorage.setItem(CACHE_KEY,JSON.stringify({items,savedAt:Date.now()}));return{items,cached:false};}
  catch(e){try{const raw=localStorage.getItem(CACHE_KEY);if(raw)return{items:JSON.parse(raw).items||[],cached:true};}catch{}throw e;}
}
