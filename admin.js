import { createAuthClient } from "https://esm.sh/@neon/auth@0.8.1?bundle";

const AUTH_URL = "https://ep-twilight-recipe-b7f21dd7.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth";
const auth = createAuthClient(AUTH_URL, { fetchOptions: { credentials: "include" } });
const $ = (id) => document.getElementById(id);
const money = (value) => "₦" + new Intl.NumberFormat("en-NG").format(Number(value || 0));
const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
let isSignUp = false;
let currentView = "dashboard";
let menuItems = [];
let zones = [];
let paymentMethods = [];
let orders = [];

function message(target, text, isError = false) {
  const node = $(target);
  node.textContent = text;
  node.classList.remove("hidden");
  node.className = isError ? "error" : "notice";
}
function hide(target) { $(target).classList.add("hidden"); }
async function getToken() {
  const token = await auth.getJWTToken();
  if (!token) throw new Error("Your secure Neon session token is unavailable. Please sign in again.");
  return token;
}
async function api(resource, method = "GET", body = null) {
  const token = await getToken();
  const response = await fetch("/api/admin?resource=" + encodeURIComponent(resource), {
    method,
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === "ADMIN_SETUP_REQUIRED") {
      throw new Error(data.error + " Once the owner email is confirmed, admin access can be activated.");
    }
    throw new Error(data.error || "The request could not be completed.");
  }
  return data;
}
let pendingEmail = "";
let pendingPassword = "";

function showApp(user) {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("signedInAs").textContent = user?.email ? "Signed in as " + user.email : "Owner session active";
  loadView("dashboard");
}
function showLogin() {
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  $("verifyView").classList.add("hidden");
  $("authForm").classList.remove("hidden");
  $("authSwitchRow").classList.remove("hidden");
}
async function refreshSession() {
  try {
    const result = await auth.getSession();
    if (result.data?.session && result.data?.user) showApp(result.data.user);
    else showLogin();
  } catch { showLogin(); }
}
function setAuthMode(signUp) {
  isSignUp = signUp;
  $("authTitle").textContent = signUp ? "Create owner account" : "Sign in to JO'S Grill";
  $("authSubmit").textContent = signUp ? "Create account" : "Sign in";
  $("nameField").hidden = !signUp;
  $("authPassword").autocomplete = signUp ? "new-password" : "current-password";
  $("switchText").textContent = signUp ? "Already registered?" : "New owner account?";
  $("switchAuth").textContent = signUp ? "Sign in" : "Create account";
  hide("authError"); hide("authNotice");
}
function showVerification(email, password) {
  pendingEmail = email;
  pendingPassword = password;
  $("verifyEmailLabel").textContent = email;
  $("verifyOtp").value = "";
  $("authTitle").textContent = "Verify your email";
  $("authForm").classList.add("hidden");
  $("authSwitchRow").classList.add("hidden");
  $("verifyView").classList.remove("hidden");
  hide("authError");
  message("authNotice", "Check your inbox for the six-digit Neon Auth verification code.");
}
$("switchAuth").addEventListener("click", () => setAuthMode(!isSignUp));
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  hide("authError"); hide("authNotice");
  $("authSubmit").disabled = true;
  try {
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (isSignUp) {
      const result = await auth.signUp.email({ name: $("authName").value.trim() || "JO'S Grill Owner", email, password });
      if (result.error) throw new Error(result.error.message || "Account creation failed.");
      showVerification(email, password);
      return;
    }
    const result = await auth.signIn.email({ email, password });
    if (result.error) {
      if (/email.*(not|isn.t)\s*verified/i.test(result.error.message || "")) {
        const sent = await auth.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
        if (sent.error) throw new Error(sent.error.message || "Could not send a verification code.");
        showVerification(email, password);
        return;
      }
      throw new Error(result.error.message || "Sign in failed.");
    }
    const session = await auth.getSession();
    if (!session.data?.user) throw new Error("Sign-in succeeded, but the owner session could not be loaded. Please try again.");
    showApp(session.data.user);
  } catch (error) {
    message("authError", error.message, true);
  } finally {
    $("authSubmit").disabled = false;
  }
});
$("verifySubmit").addEventListener("click", async () => {
  const otp = $("verifyOtp").value.trim();
  if (!/^\d{6}$/.test(otp)) return message("authError", "Enter the six-digit code from your email.", true);
  $("verifySubmit").disabled = true;
  hide("authError");
  try {
    const result = await auth.emailOtp.verifyEmail({ email: pendingEmail, otp });
    if (result.error) throw new Error(result.error.message || "Email verification failed.");
    let session = await auth.getSession();
    if (!session.data?.user && pendingPassword) {
      const signedIn = await auth.signIn.email({ email: pendingEmail, password: pendingPassword });
      if (signedIn.error) throw new Error(signedIn.error.message || "Email verified. Please sign in to continue.");
      session = await auth.getSession();
    }
    if (!session.data?.user) throw new Error("Email verified. Please return to sign in.");
    pendingPassword = "";
    showApp(session.data.user);
  } catch (error) {
    message("authError", error.message, true);
  } finally {
    $("verifySubmit").disabled = false;
  }
});
$("resendOtp").addEventListener("click", async () => {
  $("resendOtp").disabled = true;
  try {
    const result = await auth.emailOtp.sendVerificationOtp({ email: pendingEmail, type: "email-verification" });
    if (result.error) throw new Error(result.error.message || "Could not resend the code.");
    message("authNotice", "A new verification code has been sent.");
  } catch (error) {
    message("authError", error.message, true);
  } finally {
    $("resendOtp").disabled = false;
  }
});
$("backToLogin").addEventListener("click", () => {
  $("authEmail").value = pendingEmail;
  $("authPassword").value = pendingPassword;
  $("verifyView").classList.add("hidden");
  $("authForm").classList.remove("hidden");
  $("authSwitchRow").classList.remove("hidden");
  setAuthMode(false);
});
$("signOut").addEventListener("click", async () => { await auth.signOut(); showLogin(); });
$("tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  loadView(button.dataset.view);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-go]");
  if (button) loadView(button.dataset.go);
});
function activateTab(view) {
  currentView = view;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("hidden", section.id !== "view-" + view));
  hide("globalMessage");
}
async function loadView(view) {
  activateTab(view);
  try {
    if (view === "dashboard") await loadDashboard();
    if (view === "menu") await loadMenu();
    if (view === "profile") await loadProfile();
    if (view === "hours") await loadHours();
    if (view === "delivery") await loadDelivery();
    if (view === "payments") await loadPayments();
    if (view === "orders") await loadOrders();
  } catch (error) {
    message("globalMessage", error.message, true);
  }
}
async function loadDashboard() {
  const data = await api("dashboard");
  $("statOrders").textContent = data.orders.total;
  $("statNew").textContent = data.orders.new;
  $("statPreparing").textContent = data.orders.preparing;
  $("statRevenue").textContent = money(data.sales.revenue);
  $("recentOrders").innerHTML = data.recent.length ? data.recent.map((order) =>
    '<div class="item"><div class="item-main"><strong>' + escapeHtml(order.reference) + " · " + escapeHtml(order.customer_name) + '</strong><small>' + escapeHtml(order.customer_phone) + " · " + money(order.total) + '</small></div><span class="status ' + escapeHtml(order.status) + '">' + escapeHtml(order.status) + '</span></div>'
  ).join("") : '<div class="empty">No customer orders have been received yet.</div>';
}
async function loadMenu() {
  const data = await api("menu");
  menuItems = data.items;
  $("menuList").innerHTML = menuItems.length ? menuItems.map((item) =>
    '<div class="item"><div class="item-main"><strong>' + escapeHtml(item.name) + '</strong><small>' + money(item.price) + " · " + escapeHtml(item.category) + " · " + (item.is_published ? "Published" : "Draft") + " · " + (item.is_available ? "Available" : "Unavailable") + '</small></div><div class="actions"><button class="btn small light" data-edit-menu="' + item.id + '">Edit</button><button class="btn small" data-delete-menu="' + item.id + '">Delete</button></div></div>'
  ).join("") : '<div class="empty">No menu records found.</div>';
}
function resetMenu() {
  $("menuForm").reset(); $("menuId").value = ""; $("menuFormTitle").textContent = "Add menu item";
  $("menuAvailable").checked = false; $("menuPublished").checked = false; $("menuSort").value = "0";
}
$("menuReset").addEventListener("click", resetMenu);
$("menuList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-menu]");
  const del = event.target.closest("[data-delete-menu]");
  if (edit) {
    const item = menuItems.find((row) => row.id === edit.dataset.editMenu);
    if (!item) return;
    $("menuId").value = item.id; $("menuName").value = item.name; $("menuPrice").value = item.price;
    $("menuCategory").value = item.category; $("menuTag").value = item.tag || "";
    $("menuDescription").value = item.description || ""; $("menuImage").value = item.image_url || "";
    $("menuSort").value = item.sort_order || 0; $("menuAvailable").checked = item.is_available;
    $("menuPublished").checked = item.is_published; $("menuFormTitle").textContent = "Edit menu item";
    $("menuForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (del && confirm("Delete this menu item? Existing order snapshots will be preserved.")) {
    try { await api("menu", "DELETE", { id: del.dataset.deleteMenu }); await loadMenu(); }
    catch (error) { message("globalMessage", error.message, true); }
  }
});
$("menuForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("menuId").value;
  const body = {
    id, name: $("menuName").value.trim(), price: Number($("menuPrice").value),
    category: $("menuCategory").value, tag: $("menuTag").value.trim(),
    description: $("menuDescription").value.trim(), image_url: $("menuImage").value.trim(),
    sort_order: Number($("menuSort").value || 0), is_available: $("menuAvailable").checked,
    is_published: $("menuPublished").checked
  };
  try { await api("menu", id ? "PATCH" : "POST", body); resetMenu(); await loadMenu(); message("globalMessage", "Menu item saved."); }
  catch (error) { message("globalMessage", error.message, true); }
});
async function loadProfile() {
  const data = await api("profile"), p = data.profile || {};
  $("profileName").value = p.business_name || ""; $("profilePhone").value = p.phone || "";
  $("profileWhatsApp").value = p.whatsapp_number || ""; $("profileLogo").value = p.logo_url || "";
  $("profileAddress").value = p.address || ""; $("profileDescription").value = p.description || "";
  $("profileMinimum").value = p.minimum_order_amount || 0; $("profilePrep").value = p.estimated_prep_minutes || "";
  $("profileNotice").value = p.public_notice || ""; $("profileInstagram").value = p.instagram_url || "";
  $("profileFacebook").value = p.facebook_url || ""; $("profileDelivery").checked = p.delivery_enabled;
  $("profilePickup").checked = p.pickup_enabled;
}
$("profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = {
    business_name: $("profileName").value.trim(), phone: $("profilePhone").value.trim(),
    whatsapp_number: $("profileWhatsApp").value.trim(), logo_url: $("profileLogo").value.trim(),
    address: $("profileAddress").value.trim(), description: $("profileDescription").value.trim(),
    minimum_order_amount: Number($("profileMinimum").value || 0), estimated_prep_minutes: $("profilePrep").value ? Number($("profilePrep").value) : null,
    public_notice: $("profileNotice").value.trim(), instagram_url: $("profileInstagram").value.trim(),
    facebook_url: $("profileFacebook").value.trim(), delivery_enabled: $("profileDelivery").checked,
    pickup_enabled: $("profilePickup").checked
  };
  try { await api("profile", "PATCH", body); message("globalMessage", "Business profile updated."); }
  catch (error) { message("globalMessage", error.message, true); }
});
async function loadHours() {
  const data = await api("hours");
  const map = new Map(data.days.map((day) => [Number(day.day_of_week), day]));
  $("hoursRows").innerHTML = days.map((day, index) => {
    const row = map.get(index) || { open_time: "", close_time: "", is_closed: true };
    return '<div class="hours-row"><label>' + day + '</label><input type="time" data-open="' + index + '" value="' + (row.open_time || "") + '" ' + (row.is_closed ? "disabled" : "") + '><input type="time" data-close="' + index + '" value="' + (row.close_time || "") + '" ' + (row.is_closed ? "disabled" : "") + '><label class="closed"><input type="checkbox" data-closed="' + index + '" ' + (row.is_closed ? "checked" : "") + '> Closed</label></div>';
  }).join("");
}
$("hoursRows").addEventListener("change", (event) => {
  const closed = event.target.closest("[data-closed]");
  if (closed) {
    const day = closed.dataset.closed;
    document.querySelector('[data-open="' + day + '"]').disabled = closed.checked;
    document.querySelector('[data-close="' + day + '"]').disabled = closed.checked;
  }
});
$("hoursForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = { days: days.map((_, index) => ({
    day_of_week: index, open_time: document.querySelector('[data-open="' + index + '"]').value,
    close_time: document.querySelector('[data-close="' + index + '"]').value,
    is_closed: document.querySelector('[data-closed="' + index + '"]').checked
  })) };
  try { await api("hours", "PUT", body); message("globalMessage", "Opening hours saved."); }
  catch (error) { message("globalMessage", error.message, true); }
});
async function loadDelivery() {
  const data = await api("delivery"); zones = data.zones;
  $("deliveryList").innerHTML = zones.length ? zones.map((zone) =>
    '<div class="item"><div class="item-main"><strong>' + escapeHtml(zone.zone_name) + '</strong><small>' + escapeHtml(zone.city) + ", " + escapeHtml(zone.state) + " · " + money(zone.fee) + " · " + (zone.is_active ? "Active" : "Paused") + '</small></div><div class="actions"><button class="btn small light" data-edit-zone="' + zone.id + '">Edit</button><button class="btn small" data-delete-zone="' + zone.id + '">Delete</button></div></div>'
  ).join("") : '<div class="empty">No delivery zones yet. Add one when the fees are confirmed.</div>';
}
function resetZone() { $("deliveryForm").reset(); $("zoneId").value = ""; $("zoneActive").checked = true; $("zoneMinimum").value = "0"; }
$("zoneReset").addEventListener("click", resetZone);
$("deliveryList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-zone]"), del = event.target.closest("[data-delete-zone]");
  if (edit) {
    const zone = zones.find((row) => row.id === edit.dataset.editZone); if (!zone) return;
    $("zoneId").value = zone.id; $("zoneName").value = zone.zone_name; $("zoneCity").value = zone.city;
    $("zoneState").value = zone.state; $("zoneFee").value = zone.fee; $("zoneMinimum").value = zone.minimum_order_amount;
    $("zoneActive").checked = zone.is_active;
  }
  if (del && confirm("Delete this delivery zone?")) {
    try { await api("delivery", "DELETE", { id: del.dataset.deleteZone }); await loadDelivery(); }
    catch (error) { message("globalMessage", error.message, true); }
  }
});
$("deliveryForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const id = $("zoneId").value;
  const body = { id, zone_name: $("zoneName").value.trim(), city: $("zoneCity").value.trim(), state: $("zoneState").value.trim(), fee: Number($("zoneFee").value), minimum_order_amount: Number($("zoneMinimum").value || 0), is_active: $("zoneActive").checked };
  try { await api("delivery", id ? "PATCH" : "POST", body); resetZone(); await loadDelivery(); message("globalMessage", "Delivery zone saved."); }
  catch (error) { message("globalMessage", error.message, true); }
});
async function loadPayments() {
  const data = await api("payments"); paymentMethods = data.methods;
  $("paymentList").innerHTML = paymentMethods.length ? paymentMethods.map((method) =>
    '<div class="item"><div class="item-main"><strong>' + escapeHtml(method.method_name) + '</strong><small>' + escapeHtml(method.bank_name || "") + " · " + escapeHtml(method.account_name || "") + " · " + (method.is_active ? "Visible to customers" : "Hidden") + '</small></div><div class="actions"><button class="btn small light" data-edit-payment="' + method.id + '">Edit</button><button class="btn small" data-delete-payment="' + method.id + '">Delete</button></div></div>'
  ).join("") : '<div class="empty">No payment methods configured.</div>';
}
function resetPayment() { $("paymentForm").reset(); $("paymentId").value = ""; $("paymentActive").checked = false; }
$("paymentReset").addEventListener("click", resetPayment);
$("paymentList").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-payment]"), del = event.target.closest("[data-delete-payment]");
  if (edit) {
    const p = paymentMethods.find((row) => row.id === edit.dataset.editPayment); if (!p) return;
    $("paymentId").value = p.id; $("paymentName").value = p.method_name; $("paymentBank").value = p.bank_name || "";
    $("paymentAccountName").value = p.account_name || ""; $("paymentAccountNumber").value = p.account_number || "";
    $("paymentInstructions").value = p.instructions || ""; $("paymentActive").checked = p.is_active;
  }
  if (del && confirm("Delete this payment method?")) {
    try { await api("payments", "DELETE", { id: del.dataset.deletePayment }); await loadPayments(); }
    catch (error) { message("globalMessage", error.message, true); }
  }
});
$("paymentForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const id = $("paymentId").value;
  const body = { id, method_name: $("paymentName").value.trim(), bank_name: $("paymentBank").value.trim(), account_name: $("paymentAccountName").value.trim(), account_number: $("paymentAccountNumber").value.trim(), instructions: $("paymentInstructions").value.trim(), is_active: $("paymentActive").checked };
  try { await api("payments", id ? "PATCH" : "POST", body); resetPayment(); await loadPayments(); message("globalMessage", "Payment method saved."); }
  catch (error) { message("globalMessage", error.message, true); }
});
async function loadOrders() {
  const data = await api("orders"); orders = data.orders;
  $("ordersBody").innerHTML = orders.length ? orders.map((order) => {
    const itemText = (order.items || []).map((item) => escapeHtml(item.name) + " × " + item.quantity).join("<br>");
    return '<tr><td><strong>' + escapeHtml(order.reference) + '</strong><br><small>' + new Date(order.created_at).toLocaleString() + '</small></td><td>' + escapeHtml(order.customer_name) + '<br>' + escapeHtml(order.customer_phone) + '<br><small>' + escapeHtml(order.delivery_address) + ", " + escapeHtml(order.delivery_city) + '</small></td><td>' + itemText + '</td><td>' + money(order.subtotal) + '</td><td><select data-order-status="' + order.id + '"><option value="received">Received</option><option value="confirmed">Confirmed</option><option value="preparing">Preparing</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></td><td><select data-payment-status="' + order.id + '"><option value="unpaid">Unpaid</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="refunded">Refunded</option></select></td><td><input type="number" min="0" step="1" data-delivery-fee="' + order.id + '" value="' + Number(order.delivery_fee) + '" style="width:90px;padding:7px;border:1px solid var(--line);border-radius:7px"><label style="display:block;font-size:10px;margin-top:5px"><input type="checkbox" data-fee-confirmed="' + order.id + '" ' + (order.delivery_fee_confirmed ? "checked" : "") + '> Confirmed</label></td><td><button class="btn small red" data-save-order="' + order.id + '">Save</button></td></tr>';
  }).join("") : '<tr><td colspan="8">No orders received yet.</td></tr>';
  orders.forEach((order) => {
    const status = document.querySelector('[data-order-status="' + order.id + '"]');
    const payment = document.querySelector('[data-payment-status="' + order.id + '"]');
    if (status) status.value = order.status;
    if (payment) payment.value = order.payment_status;
  });
}
$("refreshOrders").addEventListener("click", loadOrders);
$("ordersBody").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-order]"); if (!button) return;
  const id = button.dataset.saveOrder;
  const body = {
    id,
    status: document.querySelector('[data-order-status="' + id + '"]').value,
    payment_status: document.querySelector('[data-payment-status="' + id + '"]').value,
    delivery_fee: Number(document.querySelector('[data-delivery-fee="' + id + '"]').value),
    delivery_fee_confirmed: document.querySelector('[data-fee-confirmed="' + id + '"]').checked
  };
  try { await api("orders", "PATCH", body); await loadOrders(); message("globalMessage", "Order updated."); }
  catch (error) { message("globalMessage", error.message, true); }
});
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
refreshSession();