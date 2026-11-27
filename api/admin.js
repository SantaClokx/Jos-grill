const { getPool } = require("../lib/db");
const { requireAdmin } = require("../lib/auth");

const sendError = (res, error) => res.status(error.status || 500).json({ error: error.message || "Unexpected server error", code: error.code });
const audit = async (db, userId, action, entity, entityId, details = {}) => {
  await db.query(
    "INSERT INTO public.audit_log (actor_user_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5::jsonb)",
    [userId, action, entity, entityId || null, JSON.stringify(details)]
  );
};

module.exports = async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const user = await requireAdmin(req);
    const db = getPool();
    const resource = String(req.query.resource || "dashboard");
    const body = req.body || {};

    if (req.method === "GET") {
      if (resource === "dashboard") {
        const [orders, sales, menu, recent] = await Promise.all([
          db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'received')::int AS new, count(*) FILTER (WHERE status = 'preparing')::int AS preparing, count(*) FILTER (WHERE status = 'delivered')::int AS delivered FROM public.orders"),
          db.query("SELECT COALESCE(sum(total),0)::int AS revenue FROM public.orders WHERE status = 'delivered'"),
          db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE is_published AND is_available)::int AS live FROM public.menu_items"),
          db.query("SELECT id, reference, customer_name, customer_phone, total, status, created_at FROM public.orders ORDER BY created_at DESC LIMIT 8")
        ]);
        return res.status(200).json({ orders: orders.rows[0], sales: sales.rows[0], menu: menu.rows[0], recent: recent.rows });
      }
      if (resource === "menu") {
        const result = await db.query("SELECT * FROM public.menu_items ORDER BY sort_order, created_at DESC");
        return res.status(200).json({ items: result.rows });
      }
      if (resource === "profile") {
        const result = await db.query("SELECT * FROM public.store_profile WHERE id = 1");
        return res.status(200).json({ profile: result.rows[0] || null });
      }
      if (resource === "hours") {
        const result = await db.query("SELECT day_of_week, to_char(open_time, 'HH24:MI') AS open_time, to_char(close_time, 'HH24:MI') AS close_time, is_closed, notes FROM public.business_hours ORDER BY day_of_week");
        return res.status(200).json({ days: result.rows });
      }
      if (resource === "delivery") {
        const result = await db.query("SELECT * FROM public.delivery_zones ORDER BY state, city, zone_name");
        return res.status(200).json({ zones: result.rows });
      }
      if (resource === "payments") {
        const result = await db.query("SELECT * FROM public.payment_methods ORDER BY sort_order, method_name");
        return res.status(200).json({ methods: result.rows });
      }
      if (resource === "orders") {
        const status = String(req.query.status || "");
        const params = status ? [status] : [];
        const result = await db.query(
          "SELECT o.*, COALESCE((SELECT json_agg(json_build_object('name', i.name, 'unitPrice', i.unit_price, 'quantity', i.quantity, 'lineTotal', i.unit_price * i.quantity) ORDER BY i.id) FROM public.order_items i WHERE i.order_id = o.id), '[]'::json) AS items FROM public.orders o " +
          (status ? "WHERE o.status = $1 " : "") +
          "ORDER BY o.created_at DESC LIMIT 150",
          params
        );
        return res.status(200).json({ orders: result.rows });
      }
      return res.status(404).json({ error: "Unknown admin resource." });
    }

    if (resource === "menu" && req.method === "POST") {
      const name = String(body.name || "").trim();
      const price = Number(body.price);
      if (!name || name.length > 140 || !Number.isInteger(price) || price < 0) return res.status(400).json({ error: "Enter a menu item name and a valid price." });
      const result = await db.query(
        "INSERT INTO public.menu_items (name, description, category, tag, price, image_url, is_available, is_published, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [name, String(body.description || ""), String(body.category || "mains"), String(body.tag || ""), price, String(body.image_url || ""), !!body.is_available, !!body.is_published, Number(body.sort_order || 0)]
      );
      await audit(db, user.id, "create", "menu_item", result.rows[0].id, { name });
      return res.status(201).json({ item: result.rows[0] });
    }

    if (resource === "menu" && req.method === "PATCH") {
      const id = String(body.id || "");
      const name = String(body.name || "").trim();
      const price = Number(body.price);
      if (!id || !name || !Number.isInteger(price) || price < 0) return res.status(400).json({ error: "Invalid menu item details." });
      const result = await db.query(
        "UPDATE public.menu_items SET name=$2, description=$3, category=$4, tag=$5, price=$6, image_url=$7, is_available=$8, is_published=$9, sort_order=$10, updated_at=now() WHERE id=$1 RETURNING *",
        [id, name, String(body.description || ""), String(body.category || "mains"), String(body.tag || ""), price, String(body.image_url || ""), !!body.is_available, !!body.is_published, Number(body.sort_order || 0)]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Menu item not found." });
      await audit(db, user.id, "update", "menu_item", id, { name });
      return res.status(200).json({ item: result.rows[0] });
    }

    if (resource === "menu" && req.method === "DELETE") {
      const id = String(body.id || req.query.id || "");
      const result = await db.query("DELETE FROM public.menu_items WHERE id=$1 RETURNING id", [id]);
      if (!result.rowCount) return res.status(404).json({ error: "Menu item not found." });
      await audit(db, user.id, "delete", "menu_item", id);
      return res.status(200).json({ success: true });
    }

    if (resource === "profile" && (req.method === "PATCH" || req.method === "PUT")) {
      const result = await db.query(
        "UPDATE public.store_profile SET business_name=$1, phone=$2, whatsapp_number=$3, address=$4, description=$5, logo_url=$6, pickup_enabled=$7, delivery_enabled=$8, minimum_order_amount=$9, estimated_prep_minutes=$10, public_notice=$11, instagram_url=$12, facebook_url=$13, updated_at=now() WHERE id=1 RETURNING *",
        [String(body.business_name || "JO'S Grill"), String(body.phone || ""), String(body.whatsapp_number || ""), String(body.address || ""), String(body.description || ""), String(body.logo_url || ""), !!body.pickup_enabled, !!body.delivery_enabled, Math.max(0, Number(body.minimum_order_amount || 0)), body.estimated_prep_minutes ? Number(body.estimated_prep_minutes) : null, String(body.public_notice || ""), String(body.instagram_url || ""), String(body.facebook_url || "")]
      );
      await audit(db, user.id, "update", "store_profile", "1");
      return res.status(200).json({ profile: result.rows[0] });
    }

    if (resource === "hours" && (req.method === "PUT" || req.method === "PATCH")) {
      if (!Array.isArray(body.days) || body.days.length !== 7) return res.status(400).json({ error: "Submit all seven days." });
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (const day of body.days) {
          const n = Number(day.day_of_week);
          if (!Number.isInteger(n) || n < 0 || n > 6) throw new Error("Invalid weekday.");
          await client.query(
            "INSERT INTO public.business_hours (day_of_week, open_time, close_time, is_closed, notes, updated_at) VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (day_of_week) DO UPDATE SET open_time=EXCLUDED.open_time, close_time=EXCLUDED.close_time, is_closed=EXCLUDED.is_closed, notes=EXCLUDED.notes, updated_at=now()",
            [n, day.open_time || null, day.close_time || null, !!day.is_closed, String(day.notes || "")]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
      await audit(db, user.id, "update", "business_hours", "weekly");
      return res.status(200).json({ success: true });
    }

    if (resource === "delivery" && req.method === "POST") {
      const zoneName = String(body.zone_name || "").trim(), city = String(body.city || "").trim(), state = String(body.state || "").trim();
      const fee = Number(body.fee || 0), minimum = Number(body.minimum_order_amount || 0);
      if (!zoneName || !city || !state || !Number.isInteger(fee) || fee < 0 || !Number.isInteger(minimum) || minimum < 0) return res.status(400).json({ error: "Enter a zone, city, state and valid fee." });
      const result = await db.query("INSERT INTO public.delivery_zones (zone_name, city, state, fee, minimum_order_amount, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [zoneName, city, state, fee, minimum, body.is_active !== false]);
      await audit(db, user.id, "create", "delivery_zone", result.rows[0].id, { zoneName });
      return res.status(201).json({ zone: result.rows[0] });
    }

    if (resource === "delivery" && req.method === "PATCH") {
      const result = await db.query("UPDATE public.delivery_zones SET zone_name=$2, city=$3, state=$4, fee=$5, minimum_order_amount=$6, is_active=$7, updated_at=now() WHERE id=$1 RETURNING *", [body.id, String(body.zone_name || ""), String(body.city || ""), String(body.state || ""), Number(body.fee || 0), Number(body.minimum_order_amount || 0), !!body.is_active]);
      if (!result.rowCount) return res.status(404).json({ error: "Delivery zone not found." });
      await audit(db, user.id, "update", "delivery_zone", body.id);
      return res.status(200).json({ zone: result.rows[0] });
    }

    if (resource === "delivery" && req.method === "DELETE") {
      const id = String(body.id || req.query.id || "");
      const result = await db.query("DELETE FROM public.delivery_zones WHERE id=$1 RETURNING id", [id]);
      if (!result.rowCount) return res.status(404).json({ error: "Delivery zone not found." });
      await audit(db, user.id, "delete", "delivery_zone", id);
      return res.status(200).json({ success: true });
    }

    if (resource === "payments" && req.method === "POST") {
      const methodName = String(body.method_name || "").trim();
      if (!methodName) return res.status(400).json({ error: "Payment method name is required." });
      const result = await db.query("INSERT INTO public.payment_methods (method_name, instructions, bank_name, account_name, account_number, is_active, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [methodName, String(body.instructions || ""), String(body.bank_name || ""), String(body.account_name || ""), String(body.account_number || ""), !!body.is_active, Number(body.sort_order || 0)]);
      await audit(db, user.id, "create", "payment_method", result.rows[0].id, { methodName });
      return res.status(201).json({ method: result.rows[0] });
    }

    if (resource === "payments" && req.method === "PATCH") {
      const result = await db.query("UPDATE public.payment_methods SET method_name=$2, instructions=$3, bank_name=$4, account_name=$5, account_number=$6, is_active=$7, sort_order=$8, updated_at=now() WHERE id=$1 RETURNING *", [body.id, String(body.method_name || ""), String(body.instructions || ""), String(body.bank_name || ""), String(body.account_name || ""), String(body.account_number || ""), !!body.is_active, Number(body.sort_order || 0)]);
      if (!result.rowCount) return res.status(404).json({ error: "Payment method not found." });
      await audit(db, user.id, "update", "payment_method", body.id);
      return res.status(200).json({ method: result.rows[0] });
    }

    if (resource === "payments" && req.method === "DELETE") {
      const id = String(body.id || req.query.id || "");
      const result = await db.query("DELETE FROM public.payment_methods WHERE id=$1 RETURNING id", [id]);
      if (!result.rowCount) return res.status(404).json({ error: "Payment method not found." });
      await audit(db, user.id, "delete", "payment_method", id);
      return res.status(200).json({ success: true });
    }

    if (resource === "orders" && req.method === "PATCH") {
      const allowedStatus = ["received", "confirmed", "preparing", "delivered", "cancelled"];
      const allowedPayment = ["unpaid", "pending", "paid", "refunded"];
      if (!allowedStatus.includes(body.status) || !allowedPayment.includes(body.payment_status)) return res.status(400).json({ error: "Invalid order or payment status." });
      const fee = Number(body.delivery_fee);
      if (!Number.isInteger(fee) || fee < 0) return res.status(400).json({ error: "Delivery fee must be a non-negative whole number." });
      const result = await db.query("UPDATE public.orders SET status=$2, payment_status=$3, delivery_fee=$4, total=subtotal+$4, delivery_fee_confirmed=$5, updated_at=now() WHERE id=$1 RETURNING id, reference, status, payment_status, subtotal, delivery_fee, total, delivery_fee_confirmed", [body.id, body.status, body.payment_status, fee, !!body.delivery_fee_confirmed]);
      if (!result.rowCount) return res.status(404).json({ error: "Order not found." });
      await audit(db, user.id, "update", "order", body.id, { status: body.status, payment_status: body.payment_status });
      return res.status(200).json({ order: result.rows[0] });
    }

    return res.status(404).json({ error: "Unsupported action for this resource." });
  } catch (error) {
    console.error("Admin API error:", error);
    return sendError(res, error);
  }
};