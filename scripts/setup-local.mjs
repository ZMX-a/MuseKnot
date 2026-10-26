import {writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const invite=randomBytes(24).toString('base64url');
const origin='http://127.0.0.1:4173';
const env=`NODE_ENV=development\nMUSEKNOT_HOST=127.0.0.1\nPORT=4173\nMUSEKNOT_ORIGIN=${origin}\nMUSEKNOT_BASE_PATH=/museknot\nMUSEKNOT_DATA_DIR=./data\nMUSEKNOT_BACKUP_DIR=./backups\nMUSEKNOT_INVITE_CODE=${invite}\n`;
try{
 await writeFile('.env',env,{flag:'wx',mode:0o600});
 console.log('Local .env created. Do not commit this file.');
 console.log('After npm run build and npm start, open this private local registration link:');
 console.log(origin+'/museknot/#invite='+encodeURIComponent(invite));
}catch(error){if(error.code!=='EEXIST')throw error;console.log('.env already exists; left unchanged.');}
