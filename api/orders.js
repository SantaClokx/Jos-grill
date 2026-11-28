const crypto = require("crypto");
const { getPool } = require("../lib/db");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = req.body || {};
  const name = String(body.customerName || "").trim();
  const phone = String(body.customerPhone || "").trim();
  const address = String(body.deliveryAddress || "").trim();
  const city = String(body.deliveryCity || "").trim();
  const state = String(body.deliveryState || "").trim();
  const notes = String(body.deliveryNotes || "").trim().slice(0, 1000);
  const deliveryMethod = body.deliveryMethod === "pickup" ? "pickup" : "delivery";
  const requested = Array.isArray(body.items) ? body.items : [];

  if (!name || name.length > 120 || !/^[+0-9()\s-]{7,20}$/.test(phone) || requested.length < 1 || requested.length > 30 ||
      address.length > 300 || city.length > 100 || state.length > 100 || notes.length > 1000 ||
      (body.deliveryMethod !== undefined && !["delivery", "pickup"].includes(body.deliveryMethod))) {
    return res.status(400).json({ error: "Please provide valid customer details and at least one menu item." });
  }
  if (deliveryMethod === "delivery" && (!address || !city || !state)) {
    return res.status(400).json({ error: "Delivery address, city and state are required." });
  }
  const quantities = new Map();
  for (const item of requested) {
    const id = String(item.id || "");
    const quantity = Number(item.quantity);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return res.status(400).json({ error: "One or more order items are invalid." });
    }
    quantities.set(id, (quantities.get(id) || 0) + quantity);
  }
  if ([...quantities.values()].some((q) => q > 20)) {
    return res.status(400).json({ error: "The maximum quantity per item is 20." });
  }

  const db = getPool();
  const client = await db.connect();
  try {
    const ids = [...quantities.keys()];
    const menu = await client.query(
      "SELECT id, name, price FROM public.menu_items WHERE id = ANY($1::uuid[]) AND is_published = true AND is_available = true",
      [ids]
    );
    if (menu.rows.length !== ids.length) {
      return res.status(409).json({ error: "One or more items are no longer available. Refresh the menu and try again." });
    }
    const profileResult = await client.query("SELECT * FROM public.store_profile WHERE id = 1");
    const profile = profileResult.rows[0];
    if (!profile) return res.status(503).json({ error: "Ordering is not configured yet." });
    if (deliveryMethod === "delivery" && !profile.delivery_enabled) {
      return res.status(400).json({ error: "Delivery is currently unavailable. Please contact the restaurant." });
    }
    if (deliveryMethod === "pickup" && !profile.pickup_enabled) {
      return res.status(400).json({ error: "Pickup is currently unavailable." });
    }

    const lines = menu.rows.map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: quantities.get(item.id)
    }));
    const subtotal = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (subtotal < Number(profile.minimum_order_amount || 0)) {
      return res.status(400).json({ error: "This order is below the restaurant's minimum order amount." });
    }

    let deliveryFee = 0;
    let deliveryFeeConfirmed = deliveryMethod === "pickup";
    let finalAddress = address;
    let finalCity = city;
    let finalState = state;
    if (deliveryMethod === "pickup") {
      finalAddress = profile.address;
      finalCity = "Elelenwo";
      finalState = "Rivers State";
    } else {
      const zone = await client.query(
        "SELECT fee, minimum_order_amount FROM public.delivery_zones WHERE is_active = true AND lower(city) = lower($1) AND lower(state) = lower($2) ORDER BY updated_at DESC LIMIT 1",
        [city, state]
      );
      if (zone.rows.length) {
        if (subtotal < Number(zone.rows[0].minimum_order_amount || 0)) {
          return res.status(400).json({ error: "This order is below the minimum for the selected delivery area." });
        }
        deliveryFee = Number(zone.rows[0].fee);
        deliveryFeeConfirmed = true;
      }
    }

    const id = crypto.randomUUID();
    const reference = "JG-" + new Date().getFullYear() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const withinRivers = /rivers/i.test(finalState);
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO public.orders (id, reference, customer_name, customer_phone, delivery_address, delivery_city, delivery_state, delivery_notes, subtotal, delivery_fee, total, is_within_rivers, idempotency_key, delivery_fee_confirmed, payment_status, delivery_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'unpaid',$15)",
      [id, reference, name, phone, finalAddress || "Address to be confirmed", finalCity || "Not specified", finalState || "Not specified", notes || null, subtotal, deliveryFee, subtotal + deliveryFee, withinRivers, crypto.randomUUID(), deliveryFeeConfirmed, deliveryMethod]
    );
    for (const item of lines) {
      await client.query(
        "INSERT INTO public.order_items (id, order_id, item_id, name, unit_price, quantity) VALUES (nextval('public.order_items_id_seq'),$1,$2,$3,$4,$5)",
        [id, item.id, item.name, item.price, item.quantity]
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({
      order: { id, reference, status: "received", subtotal, deliveryFee, deliveryFeeConfirmed, total: subtotal + deliveryFee, deliveryMethod },
      items: lines
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Order creation error:", error);
    return res.status(500).json({ error: "We could not save your order. Please try again or contact JO'S Grill." });
  } finally {
    client.release();
  }
};