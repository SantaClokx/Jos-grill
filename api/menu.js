const { getPool } = require("../lib/db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const db = getPool();
    const [menu, profile, hours, zones, payments] = await Promise.all([
      db.query("SELECT id, name, description, category, tag, price, image_url AS image FROM public.menu_items WHERE is_published = true AND is_available = true ORDER BY sort_order, name"),
      db.query("SELECT business_name, phone, whatsapp_number, address, description, logo_url, pickup_enabled, delivery_enabled, minimum_order_amount, estimated_prep_minutes, public_notice, instagram_url, facebook_url FROM public.store_profile WHERE id = 1"),
      db.query("SELECT day_of_week, to_char(open_time, 'HH24:MI') AS open_time, to_char(close_time, 'HH24:MI') AS close_time, is_closed, notes FROM public.business_hours ORDER BY day_of_week"),
      db.query("SELECT id, zone_name, city, state, fee, minimum_order_amount FROM public.delivery_zones WHERE is_active = true ORDER BY state, city, zone_name"),
      db.query("SELECT id, method_name, instructions, bank_name, account_name, account_number FROM public.payment_methods WHERE is_active = true ORDER BY sort_order, method_name")
    ]);
    // Admin changes must be visible on the public website immediately.
    // Never let a CDN or browser serve stale restaurant settings or menu data.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    return res.status(200).json({
      items: menu.rows,
      profile: profile.rows[0] || null,
      hours: hours.rows,
      deliveryZones: zones.rows,
      paymentMethods: payments.rows
    });
  } catch (error) {
    console.error("Public menu error:", error);
    return res.status(500).json({ error: "The menu is temporarily unavailable." });
  }
};