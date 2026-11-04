import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const index=read('index.html'),app=read('app.js'),admin=read('admin.html'),adminJs=read('admin.js'),config=read('config.js');
new Script(app,{filename:'app.js'});new Script(adminJs,{filename:'admin.js'});new Script(config,{filename:'config.js'});
for(const id of ['catalog','cartDrawer','checkoutForm','storeStatus','itemModal','cartItems','cartTotal','sendOrder','clientName','clientPhone','street','neighborhood','city','payment'])assert(index.includes('id="'+id+'"'),'Missing public element '+id);
for(const id of ['loginForm','signupBtn','adminContent','editDialog','settingsForm']){if(id==='settingsForm')assert(adminJs.includes(id));else assert(admin.includes('id="'+id+'"'),'Missing admin element '+id);}
for(const name of ['app.js','config.js','manifest.webmanifest','admin.html','privacidade.html'])assert(index.includes(name),'Missing reference '+name);
assert(!config.includes('service_role'),'Never publish a service role key in frontend');
const manifest=JSON.parse(read('manifest.webmanifest'));
assert(manifest.name.includes('Vilar Burguer'));assert(manifest.display==='standalone');
const edge=read('supabase/functions/submit-order/index.ts');
for(const value of ['SERVICE_ROLE_KEY','subtotal_cents','idempotency_key','delivery_fee_cents'])assert(edge.includes(value),'Missing backend control '+value);
console.log('✓ Sintaxe, arquivos, referências e controles principais verificados.');
