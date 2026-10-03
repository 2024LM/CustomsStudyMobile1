import {useEffect,useState} from 'react';
import {newsService} from '../services/newsService';

export function useNewsAutoTranslation(sourceId:string){
  const read=()=>newsService.sources().find(source=>source.id===sourceId)?.autoTranslate===true;
  const [enabled,setEnabled]=useState(read);
  useEffect(()=>{setEnabled(read());return newsService.subscribe(()=>setEnabled(read()));},[sourceId]);
  return enabled;
}
