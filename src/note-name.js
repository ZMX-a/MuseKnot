import * as db from './db.js';
import {activeUserId} from './cloud.js';
export function normalizeName(value){
 const title=String(value??'').trim();
 if(title.length>80)throw Error('名称最多 80 个字符。');
 if(/[\x00-\x1f\x7f]/.test(title))throw Error('名称请写在一行内。');
 return title;
}
// Fetch current content first; the existing metadata endpoint merges only allowed
// metadata and rejects stale body snapshots rather than replacing any entries.
export async function renameSavedNote(id,value,expectedTitle,{repository=db,owner=activeUserId(),getOwner=activeUserId,now=Date.now}={}){
 const title=normalizeName(value);
 if(!owner)throw Error('请先登录。');
 const latest=await repository.getInspiration(id);
 if(getOwner()!==owner)throw Error('账号已变化，请重新打开这条记录。');
 if(!latest)throw Error('这条灵感已不存在。');
 if((latest.title||'')!==expectedTitle)throw Error('这条灵感的名称已在另一处修改，请重新打开后核对。');
 if((latest.title||'')===title)return latest;
 return repository.saveInspiration({...latest,title,updatedAt:Math.max(now(),(latest.updatedAt||0)+1)});
}
