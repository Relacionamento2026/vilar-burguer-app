// Checkout Pix-first: bloqueado até existir cobrança dinâmica e webhook autenticado.
// Não adicionar pedidos nem liberar WhatsApp antes da confirmação do provedor.
const ORIGINS=new Set(["https://vilar-burguer.onrender.com","https://vilar-burguer-pedidos.onrender.com","http://localhost:4173","http://localhost:8000","http://127.0.0.1:8000"]);
const cors=(origin:string|null)=>({
 "Access-Control-Allow-Origin":origin&&ORIGINS.has(origin)?origin:"https://vilar-burguer.onrender.com",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, content-type",
 "Cache-Control":"no-store","Vary":"Origin","X-Content-Type-Options":"nosniff"
});
Deno.serve((req:Request)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(origin&&!ORIGINS.has(origin))return new Response(JSON.stringify({error:"Origem não autorizada."}),{status:403,headers:{"Content-Type":"application/json",...cors(origin)}});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"Método não permitido."}),{status:405,headers:{"Content-Type":"application/json",...cors(origin)}});
 // BLOQUEIO COMERCIAL: nenhum pedido é registrado enquanto Pix automático não estiver homologado.
 return new Response(JSON.stringify({ok:false,error:"Pagamento Pix em configuração. Nenhum pedido foi criado ou confirmado."}),{
  status:503,headers:{"Content-Type":"application/json; charset=utf-8",...cors(origin)}
 });
});
