import { backup, DatabaseSync } from 'node:sqlite';
import { mkdir, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const dataDir=resolve(process.env.MUSEKNOT_DATA_DIR || './data');
const backupDir=resolve(process.env.MUSEKNOT_BACKUP_DIR || './backups');
await mkdir(backupDir,{recursive:true,mode:0o700});
const stamp=new Date().toISOString().replaceAll(':','-');
const destination=join(backupDir,'museknot-'+stamp+'.sqlite');
const source=new DatabaseSync(join(dataDir,'museknot.sqlite'),{readOnly:true});
try {
  await backup(source,destination);
  await chmod(destination,0o600);
  const copy=new DatabaseSync(destination,{readOnly:true});
  try {
    if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('备份完整性检查失败');
  } finally { copy.close(); }
  console.log(destination);
} finally { source.close(); }
