// Consulta pública restrita a um token secreto de rastreamento; nunca expõe dados pessoais.
const BASE=Deno.env.get("SUPABASE_URL")||"";
const SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ORIGINS=new Set(["https://vilar-burguer.onrender.com","https://vilar-burguer-pedidos.onrender.com","http://localhost:4173","http://localhost:8000","http://127.0.0.1:8000"]);
function headers(origin:string|null){
 return {"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Access-Control-Allow-Origin":origin&&ORIGINS.has(origin)?origin:"https://vilar-burguer.onrender.com","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"apikey, content-type","Vary":"Origin"};
}
function respond(code:number,body:unknown,origin:string|null){
 return new Response(JSON.stringify(body),{status:code,headers:headers(origin)});
}
async function query(path:string){
 const res=await fetch(BASE+"/rest/v1/"+path,{headers:{apikey:SECRET,Authorization:"Bearer "+SECRET,Accept:"application/json"},cache:"no-store"});
 if(!res.ok)throw new Error("DB "+res.status);
 return await res.json();
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="GET")return respond(405,{error:"Método não permitido."},origin);
 if(origin&&!ORIGINS.has(origin))return respond(403,{error:"Origem não autorizada."},origin);
 const token=new URL(req.url).searchParams.get("token")||"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))
   return respond(400,{error:"Link de acompanhamento inválido."},origin);
 try{
  const found=await query("orders?select=id,order_code,status,payment_status,created_at,updated_at,paid_at&tracking_token=eq."+encodeURIComponent(token)+"&limit=1");
  if(!found.length)return respond(404,{error:"Pedido não encontrado. Confira o link recebido."},origin);
  const o=found[0];
  const events=await query("order_status_events?select=status,created_at&order_id=eq."+encodeURIComponent(o.id)+"&order=created_at.asc,id.asc&limit=40");
  return respond(200,{ok:true,order_code:o.order_code,status:o.status,payment_status:o.payment_status,
   created_at:o.created_at,updated_at:o.updated_at,paid_at:o.paid_at,events:events.map((e:any)=>({status:e.status,at:e.created_at}))},origin);
 }catch(err){console.error("order-status",String(err).slice(0,90));return respond(503,{error:"Não foi possível atualizar o acompanhamento. Tente novamente."},origin);}
});
