
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORIGINS = new Set(["https://vilar-burguer.onrender.com","https://vilar-burguer-pedidos.onrender.com","https://relacionamento2026.github.io","http://localhost:4173","http://localhost:8000","http://127.0.0.1:8000"]);
const allowed = (origin: string|null) => !origin || ORIGINS.has(origin);
const cors = (origin: string|null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://vilar-burguer-pedidos.onrender.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin"
});
function reply(status: number, body: unknown, origin: string|null) {
 return new Response(JSON.stringify(body), {status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...cors(origin)}});
}
const clean=(x: unknown,max=100) => typeof x==="string"?x.replace(/[\r\n\t]+/g," ").trim().slice(0,max):"";
const digits=(x: unknown) => clean(x,30).replace(/\D/g,"");
const slug=(x: unknown) => typeof x==="string" && /^[a-z0-9-]{2,80}$/.test(x);
const norm=(x: unknown) => clean(x,120).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
async function db(table: string, params: string, method="GET", body?: unknown) {
 const res=await fetch(SUPABASE_URL+"/rest/v1/"+table+params,{
  method,headers:{"apikey":SERVICE_KEY,"Authorization":"Bearer "+SERVICE_KEY,"Content-Type":"application/json","Prefer":method==="POST"?"return=representation":"return=minimal"},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 if(!res.ok){const err=await res.text();console.error("DB request failed",table,res.status,err.slice(0,180));throw new Error("database_unavailable");}
 return res.status===204?[]:await res.json();
}
function storeOpen(settings: any) {
 if(settings.open_override===false)return false;
 if(settings.open_override===true)return true;
 const hours=settings.opening_hours;
 if(!hours || !Object.keys(hours).length)return true;
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 const get=(t:string)=>parts.find(x=>x.type===t)?.value??"";
 const weekdays=["sun","mon","tue","wed","thu","fri","sat"];
 const today=get("weekday").toLowerCase(),prev=weekdays[(weekdays.indexOf(today)+6)%7],now=Number(get("hour"))*60+Number(get("minute"));
 const mins=(s:string)=>{const m=/^(\d{2}):(\d{2})$/.exec(s);return m?Number(m[1])*60+Number(m[2]):-1};
 const active=(slot:any,fromPrevious:boolean)=>{
  if(!slot?.open||!slot?.close)return false;
  const start=mins(slot.open),end=mins(slot.close);
  if(start<0||end<0)return false;
  if(start===end)return !fromPrevious;
  if(end>start)return !fromPrevious&&now>=start&&now<end;
  return fromPrevious?now<end:now>=start;
 };
 return active(hours[today],false)||active(hours[prev],true);
}
Deno.serve(async (req:Request) => {
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return reply(405,{error:"Método não permitido."},origin);
 if(!allowed(origin))return reply(403,{error:"Origem não autorizada."},origin);
 if(Number(req.headers.get("content-length")||0)>25000)return reply(413,{error:"Pedido muito grande."},origin);
 // BLOQUEIO COMERCIAL: sem gateway Pix e webhook de confirmação, nenhum pedido pode ser criado.
 return reply(503,{error:"Pagamento Pix em configuração. Nenhum pedido foi criado ou confirmado."},origin);
 try{
  const data=await req.json();
  if(!data || typeof data!=="object" || data.website)return reply(400,{error:"Dados inválidos."},origin);
  const c=data.customer??{},items=data.items;
  const name=clean(c.name,90),phone=digits(c.phone),street=clean(c.street,130),number=clean(c.number,20),
        neighborhood=clean(c.neighborhood,100),city=clean(c.city,100),zip=digits(c.zip),
        complement=clean(c.complement,110),reference=clean(c.reference,150),
        payment=clean(c.payment,60),changeFor=clean(c.change,30),notes=clean(c.notes,400);
  if(name.length<2||street.length<2||!number||neighborhood.length<2||city.length<2||zip.length!==8||![10,11].includes(phone.length))return reply(400,{error:"Confira nome, telefone e endereço."},origin);
  if(!data.consent)return reply(400,{error:"É necessário aceitar o uso dos dados para o pedido."},origin);
  if(!Array.isArray(items)||items.length<1||items.length>30)return reply(400,{error:"Carrinho inválido."},origin);
  const idempotency=clean(data.idempotency_key,50);
  if(!/^[0-9a-f-]{36}$/i.test(idempotency))return reply(400,{error:"Identificador de pedido inválido."},origin);
  const settings=(await db("store_settings","?select=*&id=eq.1"))[0];
  if(!settings)return reply(503,{error:"Loja temporariamente indisponível."},origin);
  if(!settings.accepting_orders||!storeOpen(settings))return reply(409,{error:"Estamos fechados para novos pedidos no momento."},origin);
  if(!settings.payment_methods.includes(payment))return reply(400,{error:"Forma de pagamento indisponível."},origin);
  const duplicate=await db("orders","?select=order_code,subtotal_cents,delivery_fee_cents,discount_cents,total_cents,items&idempotency_key=eq."+encodeURIComponent(idempotency)+"&limit=1");
  if(duplicate.length)return reply(200,{ok:true,...duplicate[0],whatsapp:settings.whatsapp,duplicate:true},origin);
  const since=new Date(Date.now()-15*60*1000).toISOString();
  const recent=await db("orders","?select=id&customer_phone=eq."+phone+"&created_at=gte."+encodeURIComponent(since)+"&limit=5");
  if(recent.length>=4)return reply(429,{error:"Muitas tentativas recentes. Entre em contato diretamente pelo WhatsApp."},origin);
  const [catalog,extraCatalog,zones]=await Promise.all([
    db("products","?select=id,name,price_cents,category_id,active"),
    db("extras","?select=id,name,price_cents,active"),
    db("delivery_zones","?select=name,city,fee_cents,eta_minutes,active")
  ]);
  const productMap=new Map(catalog.filter((x:any)=>x.active).map((x:any)=>[x.id,x]));
  const extraMap=new Map(extraCatalog.filter((x:any)=>x.active).map((x:any)=>[x.id,x]));
  let subtotal=0,quantity=0; const snapshot=[];
  for(const item of items){
   if(!slug(item.id)||!Number.isInteger(item.qty)||item.qty<1||item.qty>50) return reply(400,{error:"Quantidade ou produto inválido."},origin);
   const product:any=productMap.get(item.id);
   if(!product)return reply(409,{error:"Um produto não está mais disponível. Atualize o cardápio."},origin);
   const selected=item.extras??[];
   if(!Array.isArray(selected)||selected.length>18||new Set(selected).size!==selected.length)return reply(400,{error:"Adicionais inválidos."},origin);
   if(product.category_id==="combos" && selected.length)return reply(400,{error:"Combos não aceitam adicionais."},origin);
   let extraTotal=0;const extras=[];
   for(const id of selected){
    if(!slug(id))return reply(400,{error:"Adicional inválido."},origin);
    const extra:any=extraMap.get(id);
    if(!extra)return reply(409,{error:"Um adicional não está mais disponível. Atualize o cardápio."},origin);
    extras.push({id:extra.id,name:extra.name,price_cents:extra.price_cents});extraTotal+=extra.price_cents;
   }
   const sauce=clean(item.sauce,60),itemNotes=clean(item.notes,250);
   const unit=product.price_cents+extraTotal,line=unit*item.qty;
   quantity+=item.qty;subtotal+=line;
   snapshot.push({product_id:product.id,name:product.name,qty:item.qty,unit_price_cents:unit,base_price_cents:product.price_cents,extras,sauce,notes:itemNotes,line_total_cents:line});
  }
  if(quantity>70||subtotal>1000000)return reply(400,{error:"Pedido excede o limite permitido."},origin);
  if(subtotal<settings.minimum_order_cents)return reply(409,{error:"O pedido mínimo é de R$ "+(settings.minimum_order_cents/100).toFixed(2).replace(".",",")+"."},origin);
  const zone=zones.find((z:any)=>z.active&&norm(z.name)===norm(neighborhood)&&(!z.city||norm(z.city)===norm(city)));
  let deliveryFee=zone?zone.fee_cents:null;
  if(deliveryFee!==null&&settings.free_delivery_from_cents!==null&&subtotal>=settings.free_delivery_from_cents)deliveryFee=0;
  let discount=0,couponCode:null|string=null;
  const coupon=clean(data.coupon,24).toUpperCase();
  if(coupon){
   if(!/^[A-Z0-9_-]{3,24}$/.test(coupon))return reply(400,{error:"Cupom inválido."},origin);
   const found=(await db("coupons","?select=*&code=eq."+coupon+"&limit=1"))[0];
   if(!found||!found.active||(found.expires_at&&Date.parse(found.expires_at)<Date.now())||(found.usage_limit!==null&&found.used_count>=found.usage_limit)||subtotal<found.minimum_cents)return reply(409,{error:"Cupom indisponível para este pedido."},origin);
   discount=found.type==="percent"?Math.floor(subtotal*found.amount/100):Math.min(subtotal,found.amount);
   couponCode=coupon;
  }
  const total=deliveryFee===null?null:Math.max(0,subtotal+deliveryFee-discount);
  const inserted=await db("orders","?select=order_code,subtotal_cents,delivery_fee_cents,discount_cents,total_cents","POST",{
    idempotency_key:idempotency,customer_name:name,customer_phone:phone,street,street_number:number,complement,neighborhood,city,zip,reference,payment,change_for:changeFor,notes,items:snapshot,
    subtotal_cents:subtotal,delivery_fee_cents:deliveryFee,discount_cents:discount,total_cents:total,coupon_code:couponCode,status:"whatsapp_pending"
  });
  const order=inserted[0];
  return reply(201,{ok:true,order_code:order.order_code,subtotal_cents:subtotal,delivery_fee_cents:deliveryFee,discount_cents:discount,total_cents:total,whatsapp:settings.whatsapp,items:snapshot},origin);
 }catch(err){console.error("submit-order",String(err).slice(0,200));return reply(500,{error:"Não foi possível registrar o pedido. Tente novamente ou fale com a loja."},origin);}
});
