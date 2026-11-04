(()=>{
"use strict";
const cfg=window.VILAR_CONFIG;
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((Number(n)||0)/100);
const date=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";
const cents=v=>Math.max(0,Math.round(Number(String(v||"0").replace(",","."))*100))||0;
const reais=v=>(Number(v||0)/100).toFixed(2);
const slug=v=>String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const safeUrl=u=>/^https:\/\//i.test(u||"")?esc(u):"";
const statuses={awaiting_payment:"Aguardando Pix",whatsapp_pending:"Legado: aguardando WhatsApp",received:"Pedido confirmado",preparing:"Em preparação",dispatched:"Saiu para entrega",delivered:"Entregue",cancelled:"Cancelado"};
const workflow=["received","preparing","dispatched","delivered"];
function nextStatuses(o){
 if(o.status==="cancelled"||o.status==="delivered")return [o.status];
 if(o.payment_status!=="paid")return [o.status,"cancelled"];
 const pos=workflow.indexOf(o.status);
 return [o.status,...(pos>=0&&pos<workflow.length-1?[workflow[pos+1]]:[]),"cancelled"];
}
const trackingUrl=o=>o.tracking_token?new URL("./acompanhar.html?token="+encodeURIComponent(o.tracking_token),location.href).href:"";
const demoTrackingUrl=o=>o.tracking_token?new URL("./acompanhar.html?demo_token="+encodeURIComponent(o.tracking_token),location.href).href:"";
const todaySP=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function nextDemoStatuses(o){
 if(o.status==="delivered"||o.status==="cancelled")return [o.status];
 const i=workflow.indexOf(o.status);
 return [o.status,...(i>=0&&i<workflow.length-1?[workflow[i+1]]:[]),"cancelled"];
}
const days=[["mon","Segunda"],["tue","Terça"],["wed","Quarta"],["thu","Quinta"],["fri","Sexta"],["sat","Sábado"],["sun","Domingo"]];
const names={dashboard:"Visão geral",orders:"Pedidos",demo_orders:"Pedidos de teste",products:"Produtos",extras:"Adicionais",categories:"Categorias",delivery_zones:"Taxas de entrega",coupons:"Cupons",settings:"Configurações"};
const sb=window.supabase?.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
let state={tab:"dashboard",data:{},user:null},editContext=null;
function toast(message,err=false){const el=$("#toast");el.textContent=message;el.style.borderColor=err?"#ef7d68":"#d2a14b";el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),3800);}
function errorText(error){return error?.message||String(error||"Erro inesperado");}
function showLogin(msg=""){$("#loginScreen").classList.remove("hidden");$("#adminApp").classList.add("hidden");$("#loginError").textContent=msg;}
function showApp(){$("#loginScreen").classList.add("hidden");$("#adminApp").classList.remove("hidden");$("#accountEmail").textContent=state.user?.email||"";}
async function verifyAdmin(user){
 if(!user)return false;
 const {data,error}=await sb.from("admin_users").select("user_id,role").eq("user_id",user.id).maybeSingle();
 if(error)throw error;
 return !!data;
}
async function authenticate(){
 if(!sb){showLogin("Não foi possível carregar o sistema de autenticação.");return;}
 const {data:{user},error}=await sb.auth.getUser();
 if(error||!user){showLogin();return;}
 if(!await verifyAdmin(user)){await sb.auth.signOut();showLogin("Este usuário não possui autorização para acessar o painel.");return;}
 state.user=user;showApp();await loadAll();
}
async function loadAll(){
 $("#adminContent").innerHTML='<div class="panel">Atualizando informações...</div>';
 const tables=["categories","products","extras","delivery_zones","store_settings","orders","coupons","demo_orders","platform_contract"];
 try{
  const results=await Promise.all(tables.map(async t=>{
   let q=sb.from(t).select("*");
   if(t==="orders")q=q.order("created_at",{ascending:false}).limit(500);
   else if(t==="products"||t==="extras"||t==="categories")q=q.order("sort_order",{ascending:true});
   else if(t==="delivery_zones")q=q.order("name",{ascending:true});
   const {data,error}=await q;if(error)throw new Error(t+": "+error.message);return [t,data||[]];
  }));
  state.data=Object.fromEntries(results);
  contractReminder();
  const {data:daily,error:dailyError}=await sb.rpc("vilar_daily_sales",{p_days:14});
  state.data.daily_sales=dailyError?[]:(daily||[]);
  if(dailyError)console.warn("Relatório diário indisponível.");
  render();
 }catch(err){$("#adminContent").innerHTML='<div class="panel error">'+esc(errorText(err))+'<p>Verifique sua conexão e suas permissões.</p></div>';toast("Erro ao atualizar dados.",true);}
}
function selectTab(tab){state.tab=tab;document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));render();}
function render(){
 const tab=state.tab;$("#sectionTitle").textContent=names[tab];$("#sectionSubtitle").textContent=tab==="orders"?"A cozinha só recebe pedidos com Pix aprovado. Atualize as etapas para informar o cliente.":"Gestão do cardápio e da operação.";
 const root=$("#adminContent");
 if(tab==="dashboard")root.innerHTML=dashboard();
 else if(tab==="orders")root.innerHTML=orders();
 else if(tab==="demo_orders")root.innerHTML=demoOrders();
 else if(tab==="settings")root.innerHTML=settings();
 else root.innerHTML=listing(tab);
}
function dashboard(){
 const d=state.data,orders=d.orders||[],daily=d.daily_sales||[];
 const today=daily.find(x=>x.day===todaySP())||{confirmed_count:0,delivered_count:0,revenue_cents:0};
 const confirmed=orders.filter(x=>x.payment_status==="paid"&&workflow.includes(x.status)).length;
 const active=(d.products||[]).filter(x=>x.active).length;
 const revenue=Number(today.revenue_cents)||0,delivered=Number(today.delivered_count)||0;
 const avg=delivered?Math.round(revenue/delivered):0;
 const max=Math.max(1,...daily.map(x=>Number(x.revenue_cents)||0));
 const chart=daily.length?'<div class="sales-chart">'+daily.map(x=>{
  const value=Number(x.revenue_cents)||0;
  return '<div class="sales-row"><span>'+esc(x.day.slice(8,10)+"/"+x.day.slice(5,7))+'</span><div class="sales-track"><div class="sales-fill" style="width:'+Math.round(value/max*100)+'%"></div></div><b>'+money(value)+'</b></div>';
 }).join("")+'</div>':'<p class="muted">Sem dados de vendas.</p>';
 return contractNotice()+'<div class="cards">'+[
  ["Pedidos pagos hoje",today.confirmed_count,"Confirmações Pix reais"],
  ["Entregues hoje",today.delivered_count,"Pedidos pagos e entregues"],
  ["Faturamento hoje",money(revenue),"Apenas vendas reais entregues"],
  ["Ticket médio hoje",money(avg),"Vendas entregues"],
  ["Pedidos em andamento",confirmed,"Pedidos reais já pagos"],
  ["Produtos disponíveis",active,"Visíveis no cardápio"],
  ["Pedidos de teste",(d.demo_orders||[]).length,"Não entram no faturamento"],
  ["Pix real","Em configuração","Checkout bloqueado"]
 ].map(x=>'<div class="metric"><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></div>').join("")+'</div>'+
 '<div class="alert"><b>🔒 Pix antecipado obrigatório.</b> Os pedidos reais continuam bloqueados até a integração do provedor. Use <b>Pedidos de teste</b> para simular todo o fluxo sem cobrança.</div>'+
 '<div class="panel"><div class="panel-head"><div><h2>Vendas diárias — últimos 14 dias</h2><p class="small muted">Agrupadas pela data de entrega em São Paulo. Pedidos de teste e cancelados não entram na receita.</p></div></div>'+chart+
 '<div class="table-wrap"><table class="data-table"><thead><tr><th>Dia</th><th>Pagamentos confirmados</th><th>Pedidos entregues</th><th>Faturamento</th></tr></thead><tbody>'+daily.slice().reverse().map(x=>'<tr><td>'+esc(x.day.slice(8,10)+"/"+x.day.slice(5,7))+'</td><td>'+esc(x.confirmed_count)+'</td><td>'+esc(x.delivered_count)+'</td><td>'+money(x.revenue_cents)+'</td></tr>').join("")+'</tbody></table></div></div>'+
 '<div class="panel"><div class="panel-head"><h2>Pedidos reais recentes</h2><button class="btn" data-goto="orders">Ver todos</button></div>'+ordersTable(orders.slice(0,7))+'</div>'+
 '<div class="panel"><h2>Simulação da operação</h2><p>Crie pedidos de teste com produtos reais do cardápio, avance as etapas e acompanhe o link em tempo real. Nenhuma cobrança Pix ou mensagem é enviada.</p><div class="toolbar"><button class="btn primary" data-goto="demo_orders">Criar pedido de teste</button><a class="btn" href="./acompanhar.html?demo=1" target="_blank" rel="noopener">Prévia do acompanhamento ↗</a></div></div>';
}
function ordersTable(rows){
 if(!rows.length)return '<div class="empty">Nenhum pedido registrado ainda.</div>';
 return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Valor</th><th>Pagamento</th><th>Situação</th><th>Detalhes</th></tr></thead><tbody>'+rows.map(x=>{
 const paid=x.payment_status==="paid",options=nextStatuses(x);
 const opts=options.map(k=>'<option value="'+esc(k)+'" '+(x.status===k?"selected":"")+'>'+esc(statuses[k]||k)+'</option>').join("");
 return '<tr><td><b>#'+esc(x.order_code)+'</b></td><td>'+esc(x.customer_name)+'</td><td>'+date(x.created_at)+'</td><td>'+esc(x.total_cents===null?"A confirmar":money(x.total_cents))+'</td>'+
 '<td><span class="pill '+(paid?"green":"red")+'">'+(paid?"Pix aprovado":x.payment_status==="refunded"?"Estornado":"Não pago")+'</span></td>'+
 '<td><select aria-label="Status do pedido '+esc(x.order_code)+'" data-status="'+esc(x.id)+'" '+(options.length===1?"disabled":"")+'>'+opts+'</select></td>'+
 '<td><button class="action" data-order="'+esc(x.id)+'">Abrir</button></td></tr>';
 }).join("")+'</tbody></table></div>';
}
function orders(){
 const all=state.data.orders||[];
 return '<div class="panel"><div class="panel-head"><div><h2>Pedidos e pagamentos</h2><p class="muted small">Apenas pagamentos aprovados pelo provedor liberam o preparo. Acompanhe os status e compartilhe o link individual.</p></div><div class="toolbar"><select id="orderFilter" aria-label="Filtrar pedidos"><option value="">Todos os status</option>'+Object.entries(statuses).map(([k,v])=>'<option value="'+k+'">'+esc(v)+'</option>').join("")+'</select><button class="btn" id="exportOrders">Exportar CSV</button></div></div><div id="ordersTable">'+ordersTable(all)+'</div></div>';
}
function demoOrdersTable(rows){
 if(!rows.length)return '<div class="empty">Nenhum pedido de teste. Crie um para validar o fluxo completo.</div>';
 return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Produto</th><th>Valor simulado</th><th>Status</th><th>Acompanhamento</th></tr></thead><tbody>'+
 rows.map(o=>'<tr><td><b>'+esc(o.order_code)+'</b><br><small>'+date(o.created_at)+'</small></td><td>'+esc(o.quantity)+'× '+esc(o.product_name)+'</td><td>'+money(o.total_cents)+'</td>'+
 '<td><select data-demo-status="'+esc(o.id)+'" aria-label="Status de '+esc(o.order_code)+'" '+(nextDemoStatuses(o).length===1?"disabled":"")+'>'+
 nextDemoStatuses(o).map(st=>'<option value="'+st+'" '+(st===o.status?"selected":"")+'>'+esc(statuses[st]||st)+'</option>').join("")+'</select></td>'+
 '<td><div class="toolbar"><a class="btn" href="'+esc(demoTrackingUrl(o))+'" target="_blank" rel="noopener noreferrer">Acompanhar ↗</a><button class="btn" data-demo-copy="'+esc(o.id)+'">Copiar link</button><button class="btn danger" data-demo-delete="'+esc(o.id)+'">Excluir</button></div></td></tr>').join("")+'</tbody></table></div>';
}
function demoOrders(){
 const available=(state.data.products||[]).filter(x=>x.active);
 return '<div class="alert"><b>🧪 AMBIENTE DE TESTE.</b> Sem Pix real, sem WhatsApp e sem impacto nos indicadores de faturamento. Utilize somente dados fictícios.</div>'+
 '<form id="demoForm" class="panel"><div class="panel-head"><h2>Simular um novo pedido</h2><button class="btn primary" type="submit">Criar pedido de teste</button></div>'+
 '<div class="grid"><div class="field"><label for="demoProduct">Produto</label><select id="demoProduct" name="product_id" required>'+available.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' — '+money(x.price_cents)+'</option>').join("")+'</select></div>'+
 '<div class="field"><label for="demoQty">Quantidade</label><input id="demoQty" type="number" name="quantity" value="1" min="1" max="20" required></div></div>'+
 '<p class="small muted">O preço é calculado no banco com base no produto cadastrado. O pedido começa em “Recebido” com pagamento simulado, sem qualquer transação financeira.</p></form>'+
 '<div class="panel"><div class="panel-head"><div><h2>Pedidos simulados</h2><p class="muted small">Altere os status para testar o acompanhamento ao vivo. Os registros são independentes dos pedidos reais.</p></div><button class="btn" id="refreshDemo">↻ Atualizar</button></div>'+
 demoOrdersTable((state.data.demo_orders||[]).slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)))+'</div>';
}
async function createDemoOrder(e){
 e.preventDefault();
 const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
 try{
  const f=new FormData(e.currentTarget),product_id=String(f.get("product_id")||"");
  const quantity=Number(f.get("quantity"));
  if(!Number.isInteger(quantity)||quantity<1||quantity>20)throw Error("Quantidade inválida.");
  const {data,error}=await sb.from("demo_orders").insert({product_id,quantity}).select("id,tracking_token,order_code").single();
  if(error)throw error;
  toast("Pedido de teste criado. Nenhum pagamento foi realizado.");
  await loadAll();selectTab("demo_orders");
  const o=(state.data.demo_orders||[]).find(x=>x.id===data.id);
  if(o)window.open(demoTrackingUrl(o),"_blank","noopener,noreferrer");
 }catch(err){toast(errorText(err),true);}finally{btn.disabled=false;}
}
async function changeDemoStatus(id,status){
 const o=(state.data.demo_orders||[]).find(x=>x.id===id);
 if(!o||!nextDemoStatuses(o).includes(status)||status===o.status)return;
 const {data,error}=await sb.from("demo_orders").update({status}).eq("id",id).eq("status",o.status).select("id");
 if(error||!data?.length){toast(error?.message||"Status desatualizado. Atualize a lista.",true);await loadAll();return;}
 toast("Etapa simulada atualizada.");await loadAll();
}
async function deleteDemoOrder(id){
 const o=(state.data.demo_orders||[]).find(x=>x.id===id);
 if(!o||!confirm("Excluir permanentemente o pedido de teste "+o.order_code+"?"))return;
 const {error}=await sb.from("demo_orders").delete().eq("id",id);
 if(error){toast(error.message,true);return;}
 toast("Pedido de teste excluído.");await loadAll();
}
function listing(table){
 const rows=state.data[table]||[];
 const labels={products:["Produto","Categoria","Preço","Disponível"],extras:["Adicional","Preço","Disponível"],categories:["Categoria","Ordem","Disponível"],delivery_zones:["Bairro","Cidade","Taxa","Disponível"],coupons:["Cupom","Desconto","Uso","Disponível"]};
 const head=labels[table].map(t=>"<th>"+t+"</th>").join("");
 let html='<div class="panel"><div class="panel-head"><div><h2>'+esc(names[table])+'</h2><p class="muted small">Altere as informações e salve para refletir no cardápio.</p></div><button class="btn primary" data-new="'+table+'">+ Adicionar</button></div>';
 if(!rows.length)return html+'<div class="empty">Nenhum registro. Use “Adicionar” para começar.</div></div>';
 html+='<div class="table-wrap"><table class="data-table"><thead><tr>'+head+'<th>Ação</th></tr></thead><tbody>';
 html+=rows.map(x=>{
  let cells="";
  if(table==="products")cells='<td><div style="display:flex;align-items:center;gap:12px">'+(safeUrl(x.image_url)?'<img class="preview-img" src="'+safeUrl(x.image_url)+'" alt="">':"🍔")+'<div><b>'+esc(x.name)+'</b><br><small>'+esc(x.description).slice(0,95)+'</small></div></div></td><td>'+esc((state.data.categories||[]).find(c=>c.id===x.category_id)?.name||x.category_id)+'</td><td>'+money(x.price_cents)+'</td>';
  if(table==="extras")cells='<td><b>'+esc(x.name)+'</b></td><td>'+money(x.price_cents)+'</td>';
  if(table==="categories")cells='<td><b>'+esc(x.name)+'</b></td><td>'+esc(x.sort_order)+'</td>';
  if(table==="delivery_zones")cells='<td><b>'+esc(x.name)+'</b></td><td>'+esc(x.city||"Qualquer cidade")+'</td><td>'+money(x.fee_cents)+'</td>';
  if(table==="coupons")cells='<td><b>'+esc(x.code)+'</b></td><td>'+(x.type==="percent"?esc(x.amount)+"%":money(x.amount))+'</td><td>'+esc(x.used_count)+(x.usage_limit?"/"+esc(x.usage_limit):"")+'</td>';
  return '<tr>'+cells+'<td><span class="pill '+(x.active?"green":"red")+'">'+(x.active?"Sim":"Não")+'</span></td><td><button class="action" data-edit="'+table+'" data-id="'+esc(x.id??x.code)+'">Editar</button></td></tr>';
 }).join("");
 return html+'</tbody></table></div></div>';
}
function field(name,label,value="",type="text",attrs=""){
 const val=type==="checkbox"?'':esc(value??"");
 if(type==="checkbox")return '<label class="checkline"><input type="checkbox" name="'+name+'" '+(value?"checked":"")+'>'+esc(label)+'</label>';
 if(type==="textarea")return '<div class="field"><label for="f_'+name+'">'+esc(label)+'</label><textarea id="f_'+name+'" name="'+name+'" '+attrs+'>'+val+'</textarea></div>';
 return '<div class="field"><label for="f_'+name+'">'+esc(label)+'</label><input id="f_'+name+'" name="'+name+'" type="'+type+'" value="'+val+'" '+attrs+'></div>';
}
function choose(name,label,value,options){
 return '<div class="field"><label for="f_'+name+'">'+esc(label)+'</label><select id="f_'+name+'" name="'+name+'">'+options.map(([v,t])=>'<option value="'+esc(v)+'" '+(String(v)===String(value)?"selected":"")+'>'+esc(t)+'</option>').join("")+'</select></div>';
}
function editor(table,x={}){
 const existing=!!(x.id??x.code),isNew=!existing;
 editContext={table,original:x,isNew};
 $("#dialogTitle").textContent=(isNew?"Adicionar ":"Editar ")+names[table].toLowerCase();
 $("#saveEdit").classList.remove("hidden");
 let body="";
 if(table==="products"){
  body=field("id","Código interno",x.id||"","text",existing?'readonly':'required pattern="[a-z0-9-]{2,80}"')+
   field("name","Nome do produto",x.name||"","text",'required maxlength="140"')+
   field("description","Descrição",x.description||"","textarea",'maxlength="600"')+
   '<div class="grid">'+choose("category_id","Categoria",x.category_id||"classicos",(state.data.categories||[]).map(c=>[c.id,c.name]))+
   field("price","Preço (R$)",reais(x.price_cents),"number",'required min="0" max="10000" step="0.01"')+'</div>'+
   '<div class="grid">'+field("tag","Selo opcional",x.tag||"","text",'maxlength="50"')+
   field("sort_order","Ordem",x.sort_order||0,"number",'min="0" max="10000"')+'</div>'+
   field("image_url","URL da foto (opcional)",x.image_url||"","url",'maxlength="2000" placeholder="https://..."')+
   field("imageFile","Ou enviar imagem (JPEG, PNG ou WebP; até 5 MB)","","file",'accept="image/jpeg,image/png,image/webp"')+
   field("active","Disponível no cardápio",isNew?true:x.active,"checkbox");
 }else if(table==="extras"){
  body=field("id","Código interno",x.id||"","text",existing?'readonly':'required pattern="[a-z0-9-]{2,80}"')+
   field("name","Nome",x.name||"","text",'required maxlength="100"')+
   '<div class="grid">'+field("price","Preço (R$)",reais(x.price_cents),"number",'required min="0" max="1000" step="0.01"')+
   field("sort_order","Ordem",x.sort_order||0,"number",'min="0"')+'</div>'+
   field("active","Disponível",isNew?true:x.active,"checkbox");
 }else if(table==="categories"){
  body=field("id","Código interno",x.id||"","text",existing?'readonly':'required pattern="[a-z0-9-]{2,60}"')+
   field("name","Nome da categoria",x.name||"","text",'required maxlength="80"')+
   field("sort_order","Ordem",x.sort_order||0,"number",'min="0"')+
   field("active","Categoria ativa",isNew?true:x.active,"checkbox");
 }else if(table==="delivery_zones"){
  body=field("name","Bairro",x.name||"","text",'required maxlength="100"')+
   field("city","Cidade (vazio = qualquer)",x.city||"","text",'maxlength="100"')+
   '<div class="grid">'+field("fee","Taxa (R$)",reais(x.fee_cents),"number",'required min="0" max="1000" step="0.01"')+
   field("eta_minutes","Previsão (minutos, opcional)",x.eta_minutes||"","number",'min="5" max="240"')+'</div>'+
   field("active","Região atendida",isNew?true:x.active,"checkbox");
 }else if(table==="coupons"){
  body=field("code","Código do cupom",x.code||"","text",existing?'readonly':'required minlength="3" maxlength="24" pattern="[A-Za-z0-9_-]+"')+
   choose("type","Tipo",x.type||"percent",[["percent","Percentual (%)"],["fixed","Valor fixo (R$)"]])+
   field("amount","Valor (porcentagem ou R$)",x.type==="fixed"?reais(x.amount):x.amount||10,"number",'required min="0.01" step="0.01"')+
   field("minimum","Pedido mínimo (R$)",reais(x.minimum_cents),"number",'min="0" step="0.01"')+
   field("expires_at","Validade (opcional)",x.expires_at?x.expires_at.slice(0,16):"","datetime-local")+
   field("usage_limit","Limite de usos confirmados (opcional)",x.usage_limit??"","number",'min="1"')+
   field("active","Cupom ativo",isNew?true:x.active,"checkbox");
 }
 $("#editFields").innerHTML=body;$("#editDialog").showModal();
 if(isNew&&table==="products")$("#f_id").placeholder="ex.: x-especial";
}
async function saveEditor(e){
 e.preventDefault();if(!editContext)return;
 const {table,original,isNew}=editContext;
 const form=new FormData(e.currentTarget);
 const get=k=>String(form.get(k)||"").trim(),active=form.has("active");
 let row;
 try{
 if(table==="products"){
  row={id:get("id"),name:get("name"),description:get("description"),category_id:get("category_id"),price_cents:cents(get("price")),tag:get("tag"),sort_order:Number(get("sort_order"))||0,active,image_url:get("image_url")||null,updated_at:new Date().toISOString()};
  if(row.image_url&&!/^https:\/\//i.test(row.image_url))throw Error("A URL da imagem deve usar HTTPS.");
  const file=form.get("imageFile");
  if(file instanceof File&&file.size){
   if(file.size>5242880||!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Imagem inválida: use JPEG, PNG ou WebP de até 5 MB.");
   const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
   const path=row.id+"/"+crypto.randomUUID()+"."+ext;
   const {error:uploadError}=await sb.storage.from(cfg.imageBucket).upload(path,file,{cacheControl:"3600",upsert:false});
   if(uploadError)throw uploadError;
   row.image_url=sb.storage.from(cfg.imageBucket).getPublicUrl(path).data.publicUrl;
  }
 }else if(table==="extras")row={id:get("id"),name:get("name"),price_cents:cents(get("price")),sort_order:Number(get("sort_order"))||0,active,updated_at:new Date().toISOString()};
 else if(table==="categories")row={id:get("id"),name:get("name"),sort_order:Number(get("sort_order"))||0,active};
 else if(table==="delivery_zones")row={name:get("name"),city:get("city"),fee_cents:cents(get("fee")),eta_minutes:get("eta_minutes")?Number(get("eta_minutes")):null,active};
 else if(table==="coupons"){
  const type=get("type"),amount=Number(String(get("amount")).replace(",","."));
  row={code:get("code").toUpperCase(),type,amount:type==="fixed"?cents(get("amount")):Math.round(amount),minimum_cents:cents(get("minimum")),expires_at:get("expires_at")?new Date(get("expires_at")).toISOString():null,usage_limit:get("usage_limit")?Number(get("usage_limit")):null,active};
  if(!Number.isFinite(row.amount)||row.amount<=0||(type==="percent"&&row.amount>100))throw Error("Valor do cupom inválido.");
 }
 if(!row)throw Error("Tipo de cadastro inválido.");
 $("#saveEdit").disabled=true;
 let query;
 if(isNew)query=sb.from(table).insert(row);
 else query=sb.from(table).update(row).eq(table==="coupons"?"code":"id",table==="coupons"?original.code:original.id);
 const {error}=await query;
 if(error)throw error;
 $("#editDialog").close();editContext=null;toast("Alterações salvas.");await loadAll();
 }catch(err){toast(errorText(err),true)}finally{$("#saveEdit").disabled=false;}
}
function showOrder(id){
 const o=(state.data.orders||[]).find(x=>x.id===id);if(!o)return;
 editContext=null;$("#dialogTitle").textContent="Pedido #"+o.order_code;$("#saveEdit").classList.add("hidden");
 const items=Array.isArray(o.items)?o.items:[],paid=o.payment_status==="paid";
 $("#editFields").innerHTML='<p class="muted">Registrado em '+date(o.created_at)+' • '+esc(statuses[o.status]||o.status)+'</p>'+
 '<div class="alert"><b>Pagamento:</b> '+(paid?"✓ Pix aprovado em "+date(o.paid_at):"⏳ Não aprovado — pedido bloqueado para preparo")+'</div>'+
 '<h3>Cliente</h3><p>'+esc(o.customer_name)+' • '+esc(o.customer_phone)+'</p>'+
 '<h3>Entrega</h3><p>'+esc(o.street)+', '+esc(o.street_number)+' — '+esc(o.neighborhood)+'<br>'+esc(o.city)+' • CEP '+esc(o.zip)+'<br>'+esc(o.complement)+' '+esc(o.reference)+'</p>'+
 '<h3>Itens</h3>'+items.map(i=>'<p><b>'+esc(i.qty)+'× '+esc(i.name)+'</b> — '+money(i.line_total_cents)+'<br><small>'+esc((i.extras||[]).map(e=>e.name).join(", "))+' '+esc(i.sauce||"")+' '+esc(i.notes||"")+'</small></p>').join("")+
 '<hr style="border-color:#5a4032"><p>Subtotal: '+money(o.subtotal_cents)+'<br>Entrega: '+(o.delivery_fee_cents===null?"A confirmar":money(o.delivery_fee_cents))+'<br>Desconto: '+money(o.discount_cents)+'<br><b>Total: '+(o.total_cents===null?"A confirmar":money(o.total_cents))+'</b></p>'+
 '<p>Pagamento escolhido: '+esc(o.payment)+'</p><p>Observações: '+esc(o.notes||"—")+'</p>'+
 (paid&&o.tracking_token?'<div class="alert"><b>Acompanhamento do cliente</b><p class="small">O link individual mostra as etapas e atualiza automaticamente. O WhatsApp exige envio manual pelo administrador.</p><div class="toolbar"><button class="btn" type="button" data-copy-track="'+esc(o.id)+'">Copiar link de acompanhamento</button><button class="btn primary" type="button" data-wa-status="'+esc(o.id)+'">Avisar cliente no WhatsApp ↗</button></div></div>':'<p class="small muted">O link de acompanhamento e o aviso do pedido serão liberados após a confirmação automática do Pix.</p>');
 $("#editDialog").showModal();
}
async function changeStatus(id,status){
 const o=(state.data.orders||[]).find(x=>x.id===id);
 if(!o||!nextStatuses(o).includes(status)||status===o.status)return;
 if(status==="cancelled"&&o.payment_status==="paid"&&!confirm("Cancelar pedido pago? O cancelamento não faz estorno automático. Será necessário tratar a devolução com o provedor.")){render();return;}
 const {data,error}=await sb.from("orders").update({status}).eq("id",id).eq("status",o.status).select("id");
 if(error||!data?.length){toast(error?.message||"O pedido mudou. Atualize a página e tente novamente.",true);await loadAll();return;}
 toast("Status atualizado. O cliente verá a alteração no acompanhamento.");await loadAll();
}
function exportCsv(){
 const rows=state.data.orders||[];
 const keys=["order_code","created_at","customer_name","customer_phone","street","street_number","neighborhood","city","zip","payment","payment_status","paid_at","subtotal_cents","delivery_fee_cents","discount_cents","total_cents","status"];
 const safe=x=>{let s=String(x??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const csv="\ufeff"+keys.join(";")+"\n"+rows.map(o=>keys.map(k=>safe(o[k])).join(";")).join("\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download="vilar-pedidos-"+new Date().toISOString().slice(0,10)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function settings(){
 const x=state.data.store_settings?.[0]||{};
 const schedule=x.opening_hours||{};
 const hours=days.map(([k,n])=>{
  const h=schedule[k];return '<div class="field"><label>'+n+'</label><label class="checkline"><input type="checkbox" name="day_'+k+'" '+(h?"checked":"")+'> Atender</label><input name="open_'+k+'" type="time" value="'+esc(h?.open||"18:00")+'" aria-label="Abre '+n+'"><input name="close_'+k+'" type="time" value="'+esc(h?.close||"23:00")+'" aria-label="Fecha '+n+'"></div>';
 }).join("");
 return '<form class="panel" id="settingsForm"><div class="panel-head"><h2>Informações da loja</h2><button class="btn primary" type="submit">Salvar configurações</button></div>'+
 '<div class="grid">'+field("store_name","Nome",x.store_name||"Vilar Burguer","text",'required')+field("whatsapp","WhatsApp (DDI + DDD + número)",x.whatsapp||"","tel",'required pattern="[0-9]{12,13}"')+
 field("instagram","Instagram",x.instagram||"","text")+field("city","Cidade padrão (opcional)",x.city||"","text")+'</div>'+
 '<div class="alert"><b>Pagamento Pix antecipado:</b> o checkout permanecerá bloqueado até a integração com um provedor e confirmação automática por webhook. Não é possível habilitar pedidos manualmente.</div>'+
 '<label class="checkline"><input type="checkbox" name="accepting_orders" '+(x.accepting_orders?"checked":"")+' '+(!x.payment_gateway_ready?"disabled":"")+'> Aceitar novos pedidos (somente após integração Pix)</label>'+
 choose("open_override","Estado da loja",x.open_override===null?"auto":String(x.open_override),[["auto","Usar horários / ainda não configurados"],["true","Aberto manualmente"],["false","Fechado manualmente"]])+
 '<div class="grid">'+field("minimum_order","Pedido mínimo (R$)",reais(x.minimum_order_cents),"number",'min="0" step="0.01"')+
 field("free_delivery_from","Frete grátis a partir de (R$, opcional)",x.free_delivery_from_cents===null?"":reais(x.free_delivery_from_cents),"number",'min="0" step="0.01"')+'</div>'+
 field("delivery_note","Aviso sobre entrega",x.delivery_note||"","textarea",'maxlength="400"')+
 '<h3>Forma de pagamento</h3><div class="alert">🔒 <b>Pix antecipado obrigatório.</b> Dinheiro e cartão na entrega estão desabilitados. A conta de recebimento ainda não foi definida.</div>'+ 
 '<h3>Horários de funcionamento</h3><p class="muted small">Se nenhum dia for marcado, os horários ficam como “a confirmar”. Configure os dias para bloquear pedidos fora do expediente.</p><div class="day-grid">'+hours+'</div>'+
 '<div class="form-actions"><button class="btn primary" type="submit">Salvar configurações</button></div></form>'+
 '<form class="panel" id="passwordForm"><div class="panel-head"><h2>Segurança da conta</h2><button class="btn primary" type="submit">Alterar minha senha</button></div>'+
 '<p class="small muted">Cada administrador pode alterar sua própria senha sem solicitar ao desenvolvedor. A senha atual é exigida para confirmar sua identidade.</p>'+
 '<div class="grid"><div class="field"><label for="currentPassword">Senha atual</label><input type="password" id="currentPassword" name="current_password" autocomplete="current-password" required></div>'+
 '<div class="field"><label for="newPassword">Nova senha (mínimo 10 caracteres)</label><input type="password" id="newPassword" name="new_password" autocomplete="new-password" minlength="10" required></div>'+
 '<div class="field"><label for="confirmPassword">Confirme a nova senha</label><input type="password" id="confirmPassword" name="confirm_password" autocomplete="new-password" minlength="10" required></div></div></form>'+
 contractInfo();
}
function contractNotice(){return "";}
function brazilNowParts(){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 const part=k=>parts.find(x=>x.type===k)?.value||"00";
 return {day:part("year")+"-"+part("month")+"-"+part("day"),hour:Number(part("hour")),minute:Number(part("minute"))};
}
function contractReminder(){
 const el=$("#contractBanner"),c=state.data.platform_contract?.[0];
 if(!el)return;
 if(!c?.notice_enabled||c.payment_confirmed_at){el.classList.add("hidden");return;}
 const now=brazilNowParts(),noticeDay="2026-11-24",deadlineDay="2026-11-25";
 if(now.day!==noticeDay&&now.day!==deadlineDay){el.classList.add("hidden");return;}
 const remaining=now.day===noticeDay?27*60-now.hour*60-now.minute:3*60-now.hour*60-now.minute;
 const before=remaining>0,amount=money(c.amount_cents);
 const headline=before?"⚠️ Aviso de renovação da plataforma":"⚠️ Prazo de pagamento encerrado";
 const detail=before?"A Taxa de Renovação e Manutenção da Plataforma Vilar Burguer, no valor de <b>"+esc(amount)+"</b>, deve ser regularizada até <b>25/11/2026 às 03h (horário de Brasília)</b>. Após esse horário, o acesso administrativo poderá ser suspenso conforme as condições contratuais.":"O prazo de regularização de <b>"+esc(amount)+"</b> terminou em 25/11/2026 às 03h. Entre em contato com o responsável pela plataforma para confirmar o pagamento.";
 el.innerHTML='<strong>'+headline+'</strong><p>'+detail+'</p><small>Este aviso é destinado exclusivamente à administração da hamburgueria. Caso já tenha efetuado o pagamento, solicite a confirmação ao responsável.</small>';
 el.classList.remove("hidden");
 if(now.day===noticeDay&&!document.hidden){
  const key=now.day+"-"+Math.floor(now.hour/3);
  if(contractReminder.lastToast!==key){contractReminder.lastToast=key;toast("Lembrete: renovação da plataforma vence em 25/11 às 03h.");}
 }
}
function contractInfo(){
 const c=state.data.platform_contract?.[0];
 if(!c)return '';
 return '<div class="panel"><h2>Vencimento contratual</h2><p><b>Data informada:</b> '+esc(c.due_date.split("-").reverse().join("/"))+' • <b>Valor informado:</b> '+money(c.amount_cents)+'</p>'+
 '<div class="alert"><b>Avisos programados para 24/11/2026 durante todo o dia</b>, com prazo informado até 25/11/2026 às 03h (horário de Brasília). <b>Suspensão automática ainda não ativada.</b> O painel, os dados e o acompanhamento continuam acessíveis até que exista um bloqueio validado no servidor.</div></div>';
}
async function changePassword(e){
 e.preventDefault();
 const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');
 const current=form.elements.current_password.value,pass=form.elements.new_password.value,confirmPass=form.elements.confirm_password.value;
 if(pass.length<10||pass!==confirmPass){toast("A nova senha precisa ter pelo menos 10 caracteres e ser confirmada corretamente.",true);return;}
 if(pass===current){toast("Escolha uma senha diferente da atual.",true);return;}
 btn.disabled=true;
 try{
  const {error:reauthError}=await sb.auth.signInWithPassword({email:state.user.email,password:current});
  if(reauthError)throw Error("Senha atual incorreta ou sessão expirada.");
  const {error}=await sb.auth.updateUser({password:pass});
  if(error)throw error;
  form.reset();toast("Senha alterada com sucesso.");
 }catch(err){toast(errorText(err),true);}
 finally{btn.disabled=false;}
}
async function saveSettings(e){
 e.preventDefault();const f=new FormData(e.currentTarget),get=k=>String(f.get(k)||"").trim();
 const payment=["Pix"];
 const hours={};for(const [k] of days){if(f.has("day_"+k)){const open=get("open_"+k),close=get("close_"+k);if(!open||!close){toast("Preencha os horários marcados.",true);return;}hours[k]={open,close};}}
 const x={store_name:get("store_name"),whatsapp:get("whatsapp").replace(/\D/g,""),instagram:get("instagram"),city:get("city"),accepting_orders:f.has("accepting_orders")&&state.data.store_settings?.[0]?.payment_gateway_ready===true,open_override:get("open_override")==="auto"?null:get("open_override")==="true",minimum_order_cents:cents(get("minimum_order")),free_delivery_from_cents:get("free_delivery_from")?cents(get("free_delivery_from")):null,delivery_note:get("delivery_note"),payment_methods:payment,opening_hours:hours,updated_at:new Date().toISOString()};
 const {error}=await sb.from("store_settings").update(x).eq("id",1);
 if(error){toast(error.message,true);return;}toast("Configurações salvas.");await loadAll();
}
$("#loginForm").addEventListener("submit",async e=>{
 e.preventDefault();$("#loginError").textContent="";$("#loginButton").disabled=true;
 try{const {data,error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)throw error;
 if(!await verifyAdmin(data.user)){await sb.auth.signOut();throw Error("Conta sem permissão administrativa.");}
 state.user=data.user;showApp();await loadAll();
 }catch(err){$("#loginError").textContent=errorText(err);}finally{$("#loginButton").disabled=false;}
});
$("#signupBtn").addEventListener("click",async()=>{
 const email=$("#email").value.trim(),password=$("#password").value;
 if(!email||password.length<6){$("#loginError").textContent="Informe um e-mail válido e uma senha com pelo menos 6 caracteres.";return;}
 $("#signupBtn").disabled=true;$("#loginError").textContent="";
 try{
  const {error}=await sb.auth.signUp({email,password});
  if(error)throw error;
  await sb.auth.signOut();
  $("#loginError").textContent="Conta solicitada. Confirme o e-mail, se receber uma mensagem, e peça ao responsável a liberação administrativa.";
 }catch(err){$("#loginError").textContent=errorText(err);}finally{$("#signupBtn").disabled=false;}
});
async function logout(){await sb.auth.signOut();state.user=null;showLogin();}
$("#logoutBtn").addEventListener("click",logout);$("#mobileLogoutBtn").addEventListener("click",logout);
$("#refreshBtn").addEventListener("click",loadAll);
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>selectTab(b.dataset.tab)));
$("#adminContent").addEventListener("click",e=>{
 const n=e.target.closest("[data-new]"),ed=e.target.closest("[data-edit]"),ord=e.target.closest("[data-order]"),go=e.target.closest("[data-goto]");
 if(n)editor(n.dataset.new);else if(ed){const t=ed.dataset.edit;const obj=(state.data[t]||[]).find(x=>String(x.id??x.code)===ed.dataset.id);if(obj)editor(t,obj);}
 else if(ord)showOrder(ord.dataset.order);else if(go)selectTab(go.dataset.goto);
 else if(e.target.closest("#exportOrders"))exportCsv();
 else if(e.target.closest("#refreshDemo"))loadAll();
 else if(e.target.closest("[data-demo-copy]")){
  const o=(state.data.demo_orders||[]).find(x=>x.id===e.target.closest("[data-demo-copy]").dataset.demoCopy);
  if(o)navigator.clipboard.writeText(demoTrackingUrl(o)).then(()=>toast("Link de teste copiado.")).catch(()=>window.prompt("Copie o link:",demoTrackingUrl(o)));
 }
 else if(e.target.closest("[data-demo-delete]"))deleteDemoOrder(e.target.closest("[data-demo-delete]").dataset.demoDelete);
});

$("#editFields").addEventListener("click",async e=>{
 const copy=e.target.closest("[data-copy-track]"),wa=e.target.closest("[data-wa-status]");
 if(!copy&&!wa)return;
 const id=(copy||wa).dataset.copyTrack||(copy||wa).dataset.waStatus;
 const o=(state.data.orders||[]).find(x=>x.id===id);
 if(!o||o.payment_status!=="paid"||!o.tracking_token){toast("Acompanhamento disponível somente após Pix aprovado.",true);return;}
 const url=trackingUrl(o);
 if(copy){
  try{await navigator.clipboard.writeText(url);toast("Link de acompanhamento copiado.");}
  catch(err){window.prompt("Copie o link:",url);}
 }else{
  const phone=String(o.customer_phone||"").replace(/\D/g,"");
  if(![10,11].includes(phone.length)){toast("Telefone do cliente inválido.",true);return;}
  const text="Olá, "+o.customer_name+"! 🍔 Aqui é o Vilar Burguer. O status do seu pedido #"+o.order_code+" é: *"+(statuses[o.status]||o.status)+"*. Acompanhe as próximas atualizações pelo link: "+url+"\n\nMensagem enviada pela equipe do Vilar Burguer.";
  window.open("https://wa.me/55"+phone+"?text="+encodeURIComponent(text),"_blank","noopener,noreferrer");
 }
});
async function refreshOrdersQuietly(){
 if(!state.user||state.tab!=="orders"||document.hidden||$("#editDialog").open)return;
 const {data,error}=await sb.from("orders").select("*").order("created_at",{ascending:false}).limit(500);
 if(error||!$("#ordersTable"))return;
 state.data.orders=data||[];
 const filter=$("#orderFilter")?.value||"";
 $("#ordersTable").innerHTML=ordersTable(state.data.orders.filter(x=>!filter||x.status===filter));
}
setInterval(refreshOrdersQuietly,12000);
setInterval(contractReminder,60000);
async function refreshContractQuietly(){
 if(!state.user||document.hidden)return;
 const {data,error}=await sb.from("platform_contract").select("id,due_date,amount_cents,notice_enabled,suspension_enabled,payment_confirmed_at").eq("id",1).maybeSingle();
 if(error||!data)return;
 state.data.platform_contract=[data];
 contractReminder();
}
setInterval(refreshContractQuietly,300000);
$("#adminContent").addEventListener("change",e=>{const s=e.target.closest("[data-status]");if(s)changeStatus(s.dataset.status,s.value);
 const d=e.target.closest("[data-demo-status]");if(d)changeDemoStatus(d.dataset.demoStatus,d.value);if(e.target.id==="orderFilter"){const v=e.target.value;$("#ordersTable").innerHTML=ordersTable((state.data.orders||[]).filter(x=>!v||x.status===v));}});
$("#adminContent").addEventListener("submit",e=>{if(e.target.id==="settingsForm")saveSettings(e);if(e.target.id==="demoForm")createDemoOrder(e);if(e.target.id==="passwordForm")changePassword(e);});
$("#editForm").addEventListener("submit",saveEditor);
$("#cancelEdit").addEventListener("click",()=>$("#editDialog").close());
$("#editDialog").addEventListener("close",()=>{editContext=null;$("#saveEdit").classList.remove("hidden");});
authenticate().catch(err=>showLogin(errorText(err)));
})();