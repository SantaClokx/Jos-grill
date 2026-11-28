let WHATSAPP_NUMBER="2347083450350";
let products=[];
const cart={};let activeFilter="all";
const money=n=>"₦"+new Intl.NumberFormat("en-NG",{maximumFractionDigits:0}).format(n);
const $=id=>document.getElementById(id);
function renderMenu(){
 const query=$("menuSearch").value.trim().toLowerCase();
 const shown=products.filter(p=>(activeFilter==="all"||p.category===activeFilter)&&(!query||(p.name+" "+p.description).toLowerCase().includes(query)));
 $("menuGrid").innerHTML=shown.length?shown.map(p=>'<article class="food-card"><div class="food-image"><img src="'+escapeHtml(p.image)+'" alt="'+escapeHtml(p.name)+'" loading="lazy" onerror="this.style.display=\'none\'"><span class="food-tag">'+escapeHtml(p.tag||"")+'</span></div><div class="food-content"><div class="food-title"><h3>'+escapeHtml(p.name)+'</h3></div><p>'+escapeHtml(p.description)+'</p><div class="food-bottom"><span class="price">'+money(p.price)+'</span><button class="add-btn" type="button" data-add="'+p.id+'">Add +</button></div></div></article>').join(""):'<div class="empty-menu">No menu items match that search. Try another name or category.</div>';
}
function addItem(id){cart[id]=(cart[id]||0)+1;renderCart();showToast("Added to your order.");}
function updateQty(id,delta){cart[id]=(cart[id]||0)+delta;if(cart[id]<=0)delete cart[id];renderCart();}
function removeItem(id){delete cart[id];renderCart();showToast("Item removed.");}
function renderCart(){
 const ids=Object.keys(cart);let count=0,total=0;
 ids.forEach(id=>{count+=cart[id];total+=products.find(p=>String(p.id)===String(id)).price*cart[id]});
 $("navCount").textContent=count;$("itemCount").textContent=count;$("subtotal").textContent=money(total);$("total").textContent=money(total);$("checkoutButton").disabled=!count;
 if(!ids.length){$("cartList").innerHTML='<div class="cart-empty"><span>🛍️</span>Your cart is waiting.<br>Add something delicious from the menu.</div>';return;}
 $("cartList").innerHTML=ids.map(id=>{const p=products.find(x=>String(x.id)===String(id)),q=cart[id];return '<div class="cart-row"><div><strong>'+escapeHtml(p.name)+'</strong><small>'+money(p.price)+' each</small></div><div class="cart-right"><div class="qty"><button type="button" data-qty="-1" data-id="'+escapeHtml(id)+'" aria-label="Decrease '+escapeHtml(p.name)+' quantity">−</button><b>'+q+'</b><button type="button" data-qty="1" data-id="'+escapeHtml(id)+'" aria-label="Increase '+escapeHtml(p.name)+' quantity">+</button></div><span class="cart-line-price">'+money(p.price*q)+'</span><button class="remove" type="button" data-remove="'+escapeHtml(id)+'" aria-label="Remove '+escapeHtml(p.name)+'">×</button></div></div>'}).join("");
}
function showToast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove("show"),1700);}
$("filters").addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;activeFilter=b.dataset.filter;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===b));renderMenu();});
$("menuSearch").addEventListener("input",renderMenu);
$("menuGrid").addEventListener("click",e=>{const b=e.target.closest("[data-add]");if(b)addItem(b.dataset.add);});
$("cartList").addEventListener("click",e=>{const q=e.target.closest("[data-qty]"),r=e.target.closest("[data-remove]");if(q)updateQty(q.dataset.id,Number(q.dataset.qty));if(r)removeItem(r.dataset.remove);});
$("jumpCart").addEventListener("click",()=>$("order").scrollIntoView({behavior:"smooth"}));
$("mobileMenu").addEventListener("click",()=>{const n=$("mobileNav"),open=n.style.display==="flex";n.style.display=open?"none":"flex";$("mobileMenu").setAttribute("aria-expanded",String(!open));});
$("mobileNav").addEventListener("click",e=>{if(e.target.closest("a")){$("mobileNav").style.display="none";$("mobileMenu").setAttribute("aria-expanded","false");}});
$("checkoutForm").addEventListener("submit",async e=>{
 e.preventDefault();const ids=Object.keys(cart);if(!ids.length){showToast("Add an item before checking out.");return;}
 const name=$("customerName").value.trim(),phone=$("customerPhone").value.trim(),address=$("customerAddress").value.trim(),city=$("customerCity").value.trim(),state=$("customerState").value.trim(),notes=$("orderNotes").value.trim();
 if(!name||!phone||!address||!city||!state){showToast("Please complete the required details.");(!name?$("customerName"):!phone?$("customerPhone"):!address?$("customerAddress"):!city?$("customerCity"):$("customerState")).focus();return;}
 if(!/^[+0-9()\s-]{7,20}$/.test(phone)){showToast("Please enter a valid phone number.");$("customerPhone").focus();return;}
 const popup=window.open("about:blank","_blank");
 $("checkoutButton").disabled=true;$("checkoutButton").textContent="Saving your order…";
 try{
  const response=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({customerName:name,customerPhone:phone,deliveryAddress:address,deliveryCity:city,deliveryState:state,deliveryNotes:notes,deliveryMethod:"delivery",items:ids.map(id=>({id,quantity:cart[id]}))})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Could not save your order.");
  const order=data.order,lines=data.items.map(item=>"• "+item.name+" × "+item.quantity+" — "+money(item.price*item.quantity));
  const feeText=order.deliveryFeeConfirmed?money(order.deliveryFee):"Please confirm";
  const message="Hello JO'S Grill! I'd like to confirm my order.\n\nORDER REFERENCE: "+order.reference+"\n\nCUSTOMER DETAILS\nName: "+name+"\nPhone: "+phone+"\nDelivery address: "+address+", "+city+", "+state+"\n\nORDER\n"+lines.join("\n")+"\n\nFood subtotal: "+money(order.subtotal)+"\nDelivery fee: "+feeText+"\nOrder total: "+money(order.total)+(notes?"\n\nSpecial instructions: "+notes:"")+"\n\nPlease confirm my order. Thank you!";
  const url="https://wa.me/"+WHATSAPP_NUMBER+"?text="+encodeURIComponent(message);
  if(popup)popup.location.href=url;else window.location.href=url;
  Object.keys(cart).forEach(id=>delete cart[id]);renderCart();showToast("Order saved. Continue in WhatsApp.");
 }catch(error){if(popup)popup.close();showToast(error.message||"Could not save your order.");}
 finally{$("checkoutButton").textContent="Send order to WhatsApp ↗";$("checkoutButton").disabled=!Object.keys(cart).length;}
});
async function loadMenu(){
 try{
  const response=await fetch("/api/menu",{cache:"no-store"});if(!response.ok)throw new Error("Menu unavailable");
  const data=await response.json();products=data.items||[];
  if(data.profile?.whatsapp_number)WHATSAPP_NUMBER=String(data.profile.whatsapp_number).replace(/\D/g,"");
  if(data.profile){
   const notice=$("publicStoreNotice");
   if(data.profile.public_notice){notice.textContent=data.profile.public_notice;notice.hidden=false;}else{notice.hidden=true;}
   const serviceInfo=$("publicServiceInfo");
   const zones=Array.isArray(data.deliveryZones)?data.deliveryZones:[];
   const methods=Array.isArray(data.paymentMethods)?data.paymentMethods:[];
   const serviceLines=[];
   if(data.profile.delivery_enabled){
    serviceLines.push(zones.length?"Delivery areas: "+zones.map(z=>z.zone_name+" ("+money(z.fee)+(Number(z.minimum_order_amount)>0?", min. "+money(z.minimum_order_amount):"")+")").join(" · "):"Delivery is available; fees are confirmed by the restaurant.");
   }else{serviceLines.push("Delivery is currently unavailable.");}
   if(data.profile.pickup_enabled)serviceLines.push("Store pickup is available.");
   if(methods.length)serviceLines.push("Accepted payment methods: "+methods.map(m=>m.method_name+(m.bank_name?" — "+m.bank_name:"")+(m.account_name?" · "+m.account_name:"")+(m.account_number?" · "+m.account_number:"")+(m.instructions?" · "+m.instructions:"")).join(" | "));
   if(Number(data.profile.minimum_order_amount)>0)serviceLines.push("Minimum order: "+money(data.profile.minimum_order_amount));
   serviceInfo.textContent=serviceLines.join("  •  ");serviceInfo.hidden=!serviceLines.length;

   if(data.profile.address)$("publicAddress").textContent=data.profile.address;
   if(data.profile.phone)$("publicPhone").textContent=data.profile.phone;
   if(data.profile.phone)$("publicCallLink").href="tel:"+data.profile.phone.replace(/[^+0-9]/g,"");
   if(WHATSAPP_NUMBER)$("publicWhatsAppLink").href="https://wa.me/"+WHATSAPP_NUMBER;
  }
  if(Array.isArray(data.hours)){
   const openDays=data.hours.filter(day=>!day.is_closed&&day.open_time&&day.close_time);
   $("publicHours").textContent=openDays.length?"Opening hours: "+openDays.map(day=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][Number(day.day_of_week)]+" "+day.open_time+"–"+day.close_time).join(" · "):"Opening hours are being updated.";
  }
  renderMenu();renderCart();
 }catch(error){
  products=[];renderMenu();renderCart();
  $("menuGrid").innerHTML='<div class="empty-menu">The menu is temporarily unavailable. Please contact JO\'S Grill on WhatsApp.</div>';
 }
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}
$("year").textContent=new Date().getFullYear();loadMenu();
