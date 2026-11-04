(()=>{"use strict";
const CONFIG=window.VILAR_CONFIG,PHOTOS=window.VILAR_PHOTOS||{};
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n||0)/100);
const clean=s=>String(s||"").replace(/[\r\n\t]+/g," ").trim();
const norm=s=>clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
const digits=s=>clean(s).replace(/\D/g,"");
const sauceNames=["Sem preferência","Ketchup caseiro","Maionese verde","Molho de alho","Barbecue"];
let STORE={name:"Vilar Burguer",whatsapp:"5511946372832",instagram:"@Vilarburguer"};
let settings={},products=[],extras=[],zones=[],categories=[["todos","🍽️ Todos"]],ready=false,cart=[],activeCategory="todos",activeProduct=null,quantity=1,checkoutKey=crypto.randomUUID(),previousFocus=null,toastTimer=0;
try{const v=JSON.parse(localStorage.getItem("vilar-cart-v1")||"[]");if(Array.isArray(v))cart=v.slice(0,30).filter(x=>x&&typeof x.id==="string"&&Number.isInteger(x.qty)&&x.qty>0&&x.qty<=50).map(x=>({id:x.id,qty:x.qty,extras:Array.isArray(x.extras)?x.extras.filter(y=>typeof y==="string"):[],sauce:clean(x.sauce).slice(0,60)||"Sem preferência",notes:clean(x.notes).slice(0,250)}));}catch(e){}
function persist(){checkoutKey=crypto.randomUUID();try{localStorage.setItem("vilar-cart-v1",JSON.stringify(cart));}catch(e){}}
function toast(msg){const n=$("#toast");n.textContent=msg;n.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove("show"),3500)}
function photoOf(p){
 if(p.image_url&&/^https:\/\//i.test(p.image_url))return p.image_url;
 if(p.cat==="combos")return PHOTOS.combo||"";
 if(p.cat==="frango")return PHOTOS.double||"";
 if(p.cat==="vegetarianos")return p.id.includes("omelete")?PHOTOS.egg:PHOTOS.salad;
 if(p.id==="x-burguer")return PHOTOS.classic;
 if(p.id==="x-salada")return PHOTOS.salad;
 if(p.id==="x-egg"||p.id==="x-egg-salada")return PHOTOS.egg;
 if(p.id.includes("bacon"))return PHOTOS.bacon;
 return PHOTOS.double||"";
}
const productBy=id=>products.find(x=>x.id===id);
const extraBy=id=>extras.find(x=>x.id===id);
const unit=item=>(productBy(item.id)?.price||0)+(item.extras||[]).reduce((sum,id)=>sum+(extraBy(id)?.price||0),0);
const count=()=>cart.reduce((s,x)=>s+x.qty,0);
const subtotal=()=>cart.reduce((s,x)=>s+unit(x)*x.qty,0);
function storeOpen(){
 if(settings.open_override===false)return false;
 if(settings.open_override===true)return true;
 const h=settings.opening_hours||{};if(!Object.keys(h).length)return true;
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 const val=k=>parts.find(p=>p.type===k)?.value||"";
 const days=["sun","mon","tue","wed","thu","fri","sat"],today=val("weekday").toLowerCase(),prev=days[(days.indexOf(today)+6)%7],now=Number(val("hour"))*60+Number(val("minute"));
 const toMin=t=>{const m=/^(\d{2}):(\d{2})$/.exec(t);return m?Number(m[1])*60+Number(m[2]):-1};
 const active=(slot,previous)=>{if(!slot?.open||!slot?.close)return false;const a=toMin(slot.open),b=toMin(slot.close);if(a<0||b<0)return false;if(a===b)return !previous;if(b>a)return !previous&&now>=a&&now<b;return previous?now<b:now>=a;};
 return active(h[today],false)||active(h[prev],true);
}
function canOrder(){return ready&&settings.payment_gateway_ready===true&&settings.accepting_orders===true&&storeOpen();}
function showStatus(){
 const el=$("#storeStatus");if(!el)return;
 const h=settings.opening_hours||{};
 if(!ready){el.textContent="⏳ Carregando cardápio";el.classList.add("closed");return;}if(settings.payment_gateway_ready!==true){el.textContent="🔒 Pix em configuração • cardápio disponível";el.classList.add("closed");return;}
 if(!settings.accepting_orders||!storeOpen()){el.textContent="🔴 Fechado para pedidos";el.classList.add("closed");}
 else if(settings.open_override===true||Object.keys(h).length){el.textContent="🟢 Recebendo pedidos";el.classList.remove("closed");}
 else{el.textContent="🛵 Delivery • horário a confirmar";el.classList.remove("closed");}
}
function renderFilters(){$("#filters").innerHTML=categories.map(([id,label])=>'<button type="button" class="chip '+(activeCategory===id?"active":"")+'" data-cat="'+esc(id)+'" aria-pressed="'+(activeCategory===id)+'">'+esc(label)+'</button>').join("");}
function renderProducts(){
 const query=norm($("#search").value);
 const shown=products.filter(p=>(activeCategory==="todos"||p.cat===activeCategory)&&norm(p.name+" "+p.desc).includes(query));
 $("#resultCount").textContent=shown.length+" "+(shown.length===1?"item":"itens");
 $("#catalog").innerHTML=shown.map(p=>'<article class="product"><div class="product-image"><img loading="lazy" decoding="async" src="'+esc(photoOf(p))+'" alt="'+esc(p.image_url?"Imagem de "+p.name:"Imagem ilustrativa de lanche")+'"></div><div class="product-info"><div class="product-top">'+(p.tag?'<span class="tag '+(p.cat==="vegetarianos"?"veg":"")+'">'+esc(p.tag)+'</span>':"")+'</div><h3>'+esc(p.name)+'</h3><p>'+esc(p.desc)+'</p><div class="product-bottom"><strong class="price">'+money(p.price)+'</strong><button class="add-btn" data-add="'+esc(p.id)+'" type="button" '+(!ready?"disabled":"")+' aria-label="Personalizar '+esc(p.name)+'"><span aria-hidden="true">＋</span> Adicionar</button></div></div></article>').join("");
 $("#emptyResults").classList.toggle("hide",shown.length>0);
 if(!ready)$("#emptyResults").innerHTML='<p>Cardápio temporariamente indisponível. Entre em contato pelo WhatsApp.</p><a class="primary" href="https://wa.me/'+STORE.whatsapp+'" target="_blank" rel="noopener">Falar com a loja</a>';
 else $("#emptyResults").innerHTML="<p>Nenhum produto encontrado. Tente outra busca.</p><button id=\"clearSearch\" class=\"secondary\" type=\"button\">Limpar filtros</button>";
}
function toggleDialog(type,show){
 const sel=type==="item"?"#itemModal":"#cartDrawer",node=$(sel);
 if(show){previousFocus=document.activeElement;$("#overlay").classList.add("show");node.classList.add("show");node.setAttribute("aria-hidden","false");document.body.classList.add("lock");setTimeout(()=>node.querySelector(".close")?.focus(),30);}
 else{node.classList.remove("show");node.setAttribute("aria-hidden","true");$("#overlay").classList.remove("show");document.body.classList.remove("lock");if(previousFocus?.isConnected)previousFocus.focus();}
}
function closeAll(){for(const sel of ["#itemModal","#cartDrawer"]){$(sel).classList.remove("show");$(sel).setAttribute("aria-hidden","true");}$("#overlay").classList.remove("show");document.body.classList.remove("lock");if(previousFocus?.isConnected)previousFocus.focus();}
function openProduct(id){
 if(!ready){toast("O cardápio está temporariamente indisponível.");return;}
 const p=productBy(id);if(!p)return;
 activeProduct=p;quantity=1;$("#modalTitle").textContent=p.name;$("#modalDesc").textContent=p.desc;$("#modalQuantity").textContent="1";$("#itemNotes").value="";
 $("#extrasBlock").classList.toggle("hide",p.cat==="combos");
 $("#extrasList").innerHTML=extras.map(e=>'<label class="extra-choice"><input type="checkbox" value="'+esc(e.id)+'" class="extra-check" aria-label="Adicionar '+esc(e.name)+' por '+money(e.price)+'"><span class="extra-copy"><span class="extra-name">'+esc(e.name)+'</span><span class="extra-price">+ '+money(e.price)+'</span></span></label>').join("");
 $("#sauces").innerHTML=sauceNames.map((s,i)=>'<label><input type="radio" name="sauce" value="'+esc(s)+'" '+(i===0?"checked":"")+'> '+esc(s)+'</label>').join("");
 updateModalPrice();toggleDialog("item",true);
}
const checkedExtras=()=>[...document.querySelectorAll(".extra-check:checked")].map(el=>el.value);
function updateModalPrice(){if(activeProduct)$("#modalPrice").textContent=money(((activeProduct.price||0)+(activeProduct.cat==="combos"?0:checkedExtras().reduce((s,id)=>s+(extraBy(id)?.price||0),0)))*quantity);}
function addCurrentProduct(){
 if(!activeProduct||!ready)return;
 const item={id:activeProduct.id,qty:quantity,extras:activeProduct.cat==="combos"?[]:checkedExtras().sort(),sauce:document.querySelector('input[name="sauce"]:checked')?.value||"Sem preferência",notes:clean($("#itemNotes").value).slice(0,250)};
 const key=x=>JSON.stringify([x.id,x.extras,x.sauce,x.notes]);const old=cart.find(x=>key(x)===key(item));
 if(old)old.qty=Math.min(50,old.qty+quantity);else cart.push(item);
 persist();renderCart();closeAll();toast("Produto adicionado ao carrinho.");
}
function deliveryFee(){
 const z=zones.find(z=>norm(z.name)===norm($("#neighborhood").value)&&(!z.city||norm(z.city)===norm($("#city").value)));
 if(!z)return null;
 if(settings.free_delivery_from_cents!==null&&settings.free_delivery_from_cents!==undefined&&subtotal()>=settings.free_delivery_from_cents)return 0;
 return z.fee_cents;
}
function updateShipping(){
 const fee=deliveryFee(),price=subtotal(),known=fee!==null;
 $("#cartTotal").textContent=money(price);
 $("#deliveryNote").textContent=known?"Taxa de entrega: "+money(fee):"Taxa de entrega: a confirmar com a loja.";
 $("#grandTotal").textContent=known?money(price+fee):"A confirmar";
 $("#checkoutInfo").textContent=known?"Total antes de possíveis descontos de cupom. Confirme no WhatsApp.":"O valor final depende da taxa de entrega. Consulte a loja antes de confirmar.";
 const disabled=!canOrder()||!cart.length;$("#sendOrder").disabled=disabled;
 if(settings.payment_gateway_ready!==true){$("#checkoutInfo").textContent="Pagamento antecipado obrigatório. Estamos configurando o Pix automático; por segurança, não é possível finalizar pedidos ainda.";$("#sendOrder").textContent="🔒 Pagamento Pix em configuração";}else if(!canOrder())$("#checkoutInfo").textContent="Loja indisponível para pedidos pelo site no momento.";
}
function renderCart(){
 const total=count(),price=subtotal();
 $("#cartBadge").textContent=total;$("#mobileCount").textContent=total;$("#mobileTotal").textContent=money(price)+" →";$("#mobileCart").classList.toggle("hide",total===0);
 $("#drawerCount").textContent=total?"("+total+")":"";$("#emptyCart").classList.toggle("hide",total>0);$("#checkoutForm").classList.toggle("hide",total===0);$("#drawerBottom").classList.toggle("hide",total===0);
 $("#cartItems").innerHTML=cart.map((item,i)=>{const p=productBy(item.id);if(!p)return "";const ex=item.extras.map(id=>extraBy(id)?.name).filter(Boolean);
 const details=[ex.length?"Adicionais: "+ex.join(", "):"",item.sauce!=="Sem preferência"?"Molho: "+item.sauce:"",item.notes?"Obs.: "+item.notes:""].filter(Boolean).join("\n");
 return '<div class="cart-line"><span class="cart-line-left" aria-hidden="true">'+(p.cat==="combos"?"🔥":p.cat==="frango"?"🍗":p.cat==="vegetarianos"?"🌱":"🍔")+'</span><div class="cart-line-main"><div class="cart-line-title">'+esc(p.name)+'</div>'+(details?'<div class="cart-line-detail">'+esc(details)+'</div>':"")+'<div class="cart-line-bottom"><div><div class="mini-stepper"><button type="button" data-qty="'+i+'" data-delta="-1" aria-label="Diminuir '+esc(p.name)+'">−</button><strong>'+item.qty+'</strong><button type="button" data-qty="'+i+'" data-delta="1" aria-label="Aumentar '+esc(p.name)+'">+</button></div><button class="remove" type="button" data-remove="'+i+'">Remover</button></div><span class="line-price">'+money(unit(item)*item.qty)+'</span></div></div></div>';
 }).join("");
 updateShipping();
}
function message(data,order){
 const lines=["🍔 *PEDIDO — VILAR BURGUER*","#"+order.order_code,"","*CLIENTE*",clean(data.name),"Telefone: "+clean(data.phone),"","*ENTREGA*",clean(data.street)+", "+clean(data.number),"CEP: "+clean(data.zip),"Bairro: "+clean(data.neighborhood),"Cidade: "+clean(data.city)];
 if(clean(data.complement))lines.push("Complemento: "+clean(data.complement));
 if(clean(data.reference))lines.push("Referência: "+clean(data.reference));
 lines.push("","*ITENS DO PEDIDO*");
 (order.items||[]).forEach((i,n)=>{
  lines.push((n+1)+". "+i.qty+"x "+i.name+" — "+money(i.line_total_cents));
  if(i.extras?.length)lines.push("   Adicionais: "+i.extras.map(e=>e.name).join(", "));
  if(i.sauce&&i.sauce!=="Sem preferência")lines.push("   Molho: "+i.sauce);
  if(i.notes)lines.push("   Obs.: "+i.notes);
 });
 lines.push("","*RESUMO*","Produtos: "+money(order.subtotal_cents),"Entrega: "+(order.delivery_fee_cents===null?"a confirmar":money(order.delivery_fee_cents)));
 if(order.discount_cents)lines.push("Desconto: -"+money(order.discount_cents));
 lines.push("*Total: "+(order.total_cents===null?"a confirmar com a loja":money(order.total_cents))+"*");
 lines.push("Pagamento: "+clean(data.payment));
 if(clean(data.change))lines.push("Troco: "+clean(data.change));
 if(clean(data.notes))lines.push("Observações: "+clean(data.notes));
 lines.push("","⚠️ *Solicitação ainda não confirmada.* Por favor, confirme o recebimento, a disponibilidade e a entrega.");
 return lines.join("\n");
}
async function publicData(table,order){
 const url=CONFIG.url+"/rest/v1/"+table+"?select=*&"+(table==="store_settings"?"id=eq.1":table==="delivery_zones"?"active=eq.true":"active=eq.true")+(order?"&order="+order+".asc":"");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const res=await fetch(url,{headers:{"apikey":CONFIG.publishableKey},signal:controller.signal,cache:"no-store"});if(!res.ok)throw Error("Erro ao consultar "+table+" ("+res.status+")");return await res.json();}finally{clearTimeout(timer);}
}
async function bootstrap(){
 showStatus();
 try{
  const [p,e,c,z,s]=await Promise.all([publicData("products","sort_order"),publicData("extras","sort_order"),publicData("categories","sort_order"),publicData("delivery_zones","name"),publicData("store_settings")]);
  products=p.map(x=>({id:x.id,name:x.name,desc:x.description,price:x.price_cents,cat:x.category_id,tag:x.tag,image_url:x.image_url}));
  extras=e.map(x=>({id:x.id,name:x.name,price:x.price_cents}));
  categories=[["todos","🍽️ Todos"],...c.map(x=>[x.id,x.name])];zones=z;settings=s[0]||{};STORE={name:settings.store_name||"Vilar Burguer",whatsapp:settings.whatsapp||"5511946372832",instagram:settings.instagram||"@Vilarburguer"};
  cart=cart.filter(item=>productBy(item.id)&&item.extras.every(id=>extraBy(id)));
  persist();ready=true;
  if(settings.city&&!$("#city").value)$("#city").value=settings.city;
  const options=["Pix"];
  $("#payment").innerHTML='<option value="">Selecione</option>'+options.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
  document.querySelectorAll("[data-direct-wa]").forEach(a=>a.href="https://wa.me/"+STORE.whatsapp+"?text="+encodeURIComponent("Olá! Tenho uma dúvida sobre a hamburgueria."));
  showStatus();renderFilters();renderProducts();renderCart();
 }catch(err){
  console.error("Não foi possível carregar o catálogo.",err);
  ready=false;products=[];extras=[];showStatus();renderFilters();renderProducts();renderCart();toast("Não foi possível atualizar o cardápio. Tente novamente.");
 }
}

function upgradeCheckout(){
 const phone=$("#clientPhone");phone.required=true;phone.closest(".field").querySelector("label").innerHTML='Telefone com DDD <span class="required">*</span>';
 $("#street").closest(".field").insertAdjacentHTML("afterend",'<div class="field"><label for="zip">CEP <span class="required">*</span></label><input id="zip" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" required></div>');
 $("#generalNotes").closest(".field").insertAdjacentHTML("beforebegin",'<div class="field"><label for="coupon">Cupom (opcional)</label><input id="coupon" name="coupon" maxlength="24" autocomplete="off" placeholder="Código promocional"><p class="checkout-info">O desconto será validado antes de abrir o WhatsApp.</p></div>');
 $("#generalNotes").closest(".field").insertAdjacentHTML("afterend",'<div class="field"><label class="privacy-label"><input type="checkbox" id="privacyConsent" name="privacyConsent" required> Concordo com o uso dos meus dados para registrar o pedido e preparar a mensagem para a hamburgueria. <span class="required">*</span></label><p class="checkout-info">Consulte a <a href="./privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>. A mensagem só será enviada quando você confirmar no WhatsApp.</p></div>');
 const delivery=$(".delivery-note");delivery.id="deliveryNote";delivery.insertAdjacentHTML("afterend",'<div class="checkout-total"><span>Total estimado</span><strong id="grandTotal">A confirmar</strong></div><div class="checkout-info" id="checkoutInfo">Taxa de entrega a confirmar.</div>');
 $("#sendOrder").disabled=true;$("#sendOrder").textContent="🔒 Pagamento Pix em configuração";
}
upgradeCheckout();
$("#filters").addEventListener("click",e=>{const el=e.target.closest("[data-cat]");if(!el)return;activeCategory=el.dataset.cat;renderFilters();renderProducts();});
$("#search").addEventListener("input",renderProducts);
$("#catalog").addEventListener("click",e=>{const el=e.target.closest("[data-add]");if(el)openProduct(el.dataset.add);});
$("#emptyResults").addEventListener("click",e=>{if(e.target.closest("#clearSearch")){$("#search").value="";activeCategory="todos";renderFilters();renderProducts();}});
$("#extrasList").addEventListener("change",updateModalPrice);
$("#modalMinus").addEventListener("click",()=>{quantity=Math.max(1,quantity-1);$("#modalQuantity").textContent=quantity;updateModalPrice();});
$("#modalPlus").addEventListener("click",()=>{quantity=Math.min(50,quantity+1);$("#modalQuantity").textContent=quantity;updateModalPrice();});
$("#confirmItem").addEventListener("click",addCurrentProduct);
$("#openCartTop").addEventListener("click",()=>toggleDialog("cart",true));$("#mobileCart").addEventListener("click",()=>toggleDialog("cart",true));
["#closeModal","#closeCart","#overlay","#backToMenu"].forEach(s=>$(s).addEventListener("click",closeAll));
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAll();if(e.key!=="Tab")return;const active=document.querySelector(".modal.show, .drawer.show");if(!active)return;const els=[...active.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);if(!els.length)return;if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0].focus();}});
$("#cartItems").addEventListener("click",e=>{const rm=e.target.closest("[data-remove]"),q=e.target.closest("[data-qty]");if(rm){cart.splice(Number(rm.dataset.remove),1);persist();renderCart();}else if(q){const i=Number(q.dataset.qty),delta=Number(q.dataset.delta);if(cart[i]){cart[i].qty+=delta;if(cart[i].qty<=0)cart.splice(i,1);else cart[i].qty=Math.min(50,cart[i].qty);persist();renderCart();}}});
$("#payment").addEventListener("change",e=>$("#changeBlock").classList.toggle("hide",e.target.value!=="Dinheiro"));
$("#neighborhood").addEventListener("input",updateShipping);$("#city").addEventListener("input",updateShipping);
$("#checkoutForm").addEventListener("input",()=>{checkoutKey=crypto.randomUUID();});
$("#checkoutForm").addEventListener("submit",e=>{
 e.preventDefault();
 toast("O pagamento Pix automático ainda não está configurado. Nenhum pedido foi enviado ou confirmado.");
});

renderFilters();renderProducts();renderCart();bootstrap();
if("serviceWorker" in navigator&&location.protocol==="https:")window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
})();