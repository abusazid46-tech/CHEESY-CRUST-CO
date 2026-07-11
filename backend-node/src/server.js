require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const mysql = require("mysql2/promise");
const Razorpay = require("razorpay");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_PREFIX = process.env.API_PREFIX || "/api/v1";

const settings = {
  restaurantName: process.env.RESTAURANT_NAME || "Cheesy Crust Co.",
  deliveryFee: Number(process.env.DELIVERY_FEE || 40),
  freeDeliveryThreshold: Number(process.env.FREE_DELIVERY_THRESHOLD || 500),
  maxGuests: Number(process.env.MAX_GUESTS_PER_TABLE || 8),
  jwtExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "7d",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  adminEmail: (process.env.ADMIN_EMAIL || "admin@cheesycrust.co").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@123456"
};

const defaultMenuItems = [
  { name: "Golden Cheese Croissant", category: "breakfast", price: 320, description: "Flaky layers, four artisan cheeses", image_url: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400" },
  { name: "Sunrise Breakfast Pizza", category: "breakfast", price: 450, description: "Eggs, bacon, mozzarella blend", image_url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400" },
  { name: "Pancake Stack w/ Honey", category: "breakfast", price: 290, description: "Maple syrup and gold butter", image_url: "https://recipesblob.oetker.co.uk/assets/4acbec1ea07846acb27a8abc3c4d0738/1680x580/american-pancakes-v1.webp?w=400" },
  { name: "Belgian Waffle", category: "breakfast", price: 310, description: "Maple syrup, fresh berries", image_url: "https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=400" },
  { name: "Truffle Mushroom Pasta", category: "lunch", price: 540, description: "Creamy parmesan, truffle oil", image_url: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400" },
  { name: "Spicy Peri-Peri Chicken", category: "lunch", price: 620, description: "Grilled with herbed rice", image_url: "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400" },
  { name: "Margherita Classica", category: "lunch", price: 480, description: "San Marzano, basil, gold olive oil", image_url: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400" },
  { name: "Classic Cheeseburger", category: "lunch", price: 380, description: "Angus beef, aged cheddar", image_url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400" },
  { name: "Garlic Bread Supreme", category: "lunch", price: 210, description: "Cheese and herbs butter", image_url: "https://images.unsplash.com/photo-1573140400632-3a160b144b5c?w=400" },
  { name: "Cheesy Crust Signature", category: "dinner", price: 890, description: "Double cheese, pepperoni, jalapenos", image_url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400" },
  { name: "Filet Mignon Steak", category: "dinner", price: 1490, description: "Garlic butter and mashed potatoes", image_url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400" },
  { name: "Seafood Risotto", category: "dinner", price: 1120, description: "Prawns, squid, saffron risotto", image_url: "https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=400" },
  { name: "Grilled Chicken Steak", category: "dinner", price: 720, description: "Mashed potatoes and veggies", image_url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400" },
  { name: "Pepperoni Pizza", category: "dinner", price: 560, description: "Spicy pepperoni, mozzarella", image_url: "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400" },
  { name: "Tiramisu", category: "dinner", price: 290, description: "Classic Italian dessert", image_url: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400" }
];

const deliveryPincodes = new Set(["788001", "788002", "788003", "788004", "788005"]);

const corsOrigins = (process.env.CORS_ORIGINS || "https://whitesmoke-jay-438498.hostingersite.com,https://cheesy-crust-co-7w5c.vercel.app,http://localhost:5500,http://127.0.0.1:5500")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

let db;
let razorpay;

function nowSql() {
  return new Date();
}

function toJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) throw new Error("Invalid phone number");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

function normalizePincode(value) {
  const match = String(value || "").match(/\b\d{6}\b/);
  return match ? match[0] : "";
}

function deliveryPincodeFromOrder(body) {
  return normalizePincode(body.pincode || body.pin_code || body.postal_code || body.address);
}

function assertDeliveryAllowed(body) {
  if (body.order_type !== "delivery") return null;
  if (!String(body.address || "").trim()) {
    const error = new Error("Delivery address is required");
    error.status = 400;
    throw error;
  }
  const pincode = deliveryPincodeFromOrder(body);
  if (!deliveryPincodes.has(pincode)) {
    const error = new Error("Delivery is available only for PIN codes 788001, 788002, 788003, 788004 and 788005. Please choose takeaway or book a table.");
    error.status = 400;
    throw error;
  }
  return pincode;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { hash, salt };
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyPassword(password, salt, storedHash) {
  if (!salt || !storedHash) return false;
  const { hash } = hashPassword(password, salt);
  if (safeCompare(hash, storedHash)) return true;
  return safeCompare(crypto.createHash("sha256").update(String(password) + salt).digest("hex"), storedHash);
}

function idString(value) {
  return String(value);
}

function userToken(user) {
  const payload = { sub: idString(user.id), phone: user.phone, email: user.email, is_admin: Boolean(user.is_admin), type: "access" };
  const refreshPayload = { ...payload, type: "refresh" };
  return {
    access_token: jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: settings.jwtExpiresIn }),
    refresh_token: jwt.sign(refreshPayload, process.env.JWT_SECRET, { expiresIn: settings.refreshExpiresIn }),
    token_type: "bearer",
    expires_in: 7 * 24 * 60 * 60,
    user_id: idString(user.id),
    phone: user.phone,
    email: user.email,
    name: user.name,
    is_admin: Boolean(user.is_admin)
  };
}

function adminPublic(admin) {
  return {
    id: idString(admin.id),
    email: admin.email,
    name: admin.name,
    role: admin.role || "admin",
    is_active: Boolean(admin.is_active),
    last_login: admin.last_login,
    created_at: admin.created_at
  };
}

function adminToken(admin) {
  const payload = { sub: idString(admin.id), email: admin.email, name: admin.name, role: admin.role || "admin", type: "admin" };
  return {
    access_token: jwt.sign(payload, process.env.ADMIN_JWT_SECRET, { expiresIn: "24h" }),
    refresh_token: jwt.sign(payload, process.env.ADMIN_JWT_SECRET, { expiresIn: "7d" }),
    token_type: "bearer",
    expires_in: 86400,
    admin: adminPublic(admin)
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function allowedOrigin(origin) {
  if (!origin) return true;
  if (corsOrigins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return ["whitesmoke-jay-438498.hostingersite.com", "localhost", "127.0.0.1"].includes(host);
  } catch {
    return false;
  }
}

app.use(helmet());
app.use(cors({
  origin(origin, cb) {
    return allowedOrigin(origin) ? cb(null, true) : cb(new Error("Origin not allowed by CORS"));
  },
  credentials: true
}));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.post(`${API_PREFIX}/payment/webhook`, express.raw({ type: "*/*" }), paymentWebhook);
app.use(express.json({ limit: "1mb" }));

async function getUserById(id) {
  const [rows] = await db.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

async function authRequired(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(403).json({ detail: "Missing token" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUserById(payload.sub);
    if (!user) return res.status(403).json({ detail: "User not found" });
    req.auth = payload;
    req.user = user;
    return next();
  } catch {
    return res.status(403).json({ detail: "Invalid or expired token" });
  }
}

async function authOptional(req, _res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.auth = payload;
      req.user = await getUserById(payload.sub);
    }
  } catch {
    req.auth = null;
    req.user = null;
  }
  return next();
}

async function adminRequired(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ detail: "Missing admin token" });
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    const [rows] = await db.execute("SELECT * FROM admins WHERE id = ? LIMIT 1", [payload.sub]);
    const admin = rows[0];
    if (!admin || !admin.is_active) return res.status(401).json({ detail: "Admin not found or inactive" });
    req.admin = admin;
    req.adminPayload = payload;
    return next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired admin token" });
  }
}

async function migrate() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(190) NULL UNIQUE,
      name VARCHAR(120) NULL,
      password_hash VARCHAR(190) NULL,
      salt VARCHAR(64) NULL,
      dob DATE NULL,
      addresses JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS admins (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      password_hash VARCHAR(190) NOT NULL,
      salt VARCHAR(64) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'admin',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS menu_items (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      slug VARCHAR(220) NOT NULL UNIQUE,
      category VARCHAR(80) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      description TEXT NULL,
      image_url TEXT NULL,
      is_available TINYINT(1) NOT NULL DEFAULT 1,
      rating JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS carts (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      items JSON NOT NULL,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_number VARCHAR(40) NOT NULL UNIQUE,
      user_id BIGINT UNSIGNED NOT NULL,
      items JSON NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      total DECIMAL(10,2) NOT NULL,
      order_type VARCHAR(30) NOT NULL,
      address TEXT NULL,
      notes TEXT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      payment_id VARCHAR(120) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reservations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      date DATE NOT NULL,
      time VARCHAR(8) NOT NULL,
      guests INT NOT NULL,
      special_requests TEXT NULL,
      preorder_items JSON NULL,
      preorder_total DECIMAL(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
      payment_id VARCHAR(120) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      razorpay_order_id VARCHAR(120) NOT NULL UNIQUE,
      razorpay_payment_id VARCHAR(120) NULL,
      razorpay_signature TEXT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      status VARCHAR(40) NOT NULL DEFAULT 'created',
      order_id BIGINT UNSIGNED NULL,
      reservation_id BIGINT UNSIGNED NULL,
      notes JSON NULL,
      webhook_payload JSON NULL,
      last_webhook_event VARCHAR(120) NULL,
      verified_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reviews (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      item_id BIGINT UNSIGNED NULL,
      user_id BIGINT UNSIGNED NULL,
      order_id BIGINT UNSIGNED NULL,
      rating INT NOT NULL,
      comment TEXT NULL,
      approved TINYINT(1) NOT NULL DEFAULT 0,
      rejected TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS offers (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(190) NOT NULL,
      description TEXT NULL,
      discount_type VARCHAR(40) NULL,
      discount_value DECIMAL(10,2) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      data JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      id VARCHAR(80) PRIMARY KEY,
      data JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  ];
  for (const sql of statements) await db.query(sql);
}

async function ensureAdmin() {
  const [rows] = await db.execute("SELECT id FROM admins WHERE email = ? LIMIT 1", [settings.adminEmail]);
  if (rows.length) return;
  const { hash, salt } = hashPassword(settings.adminPassword);
  await db.execute(
    "INSERT INTO admins (email,name,password_hash,salt,role,is_active) VALUES (?,?,?,?,?,1)",
    [settings.adminEmail, "Super Admin", hash, salt, "super_admin"]
  );
}

async function ensureDefaultMenu() {
  const [[count]] = await db.query("SELECT COUNT(*) AS total FROM menu_items");
  if (Number(count.total) > 0) return;
  const rating = JSON.stringify({ avg: 0, count: 0 });
  for (const item of defaultMenuItems) {
    await db.execute(
      "INSERT INTO menu_items (name,slug,category,price,description,image_url,is_available,rating) VALUES (?,?,?,?,?,?,1,?)",
      [item.name, slugify(item.name), item.category, item.price, item.description, item.image_url, rating]
    );
  }
}

function slugify(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function orderNumber() {
  return `CC${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function publicMenu(row) {
  return {
    _id: idString(row.id),
    id: idString(row.id),
    name: row.name,
    slug: row.slug,
    category: row.category,
    price: Number(row.price),
    description: row.description || "",
    image_url: row.image_url || "",
    is_available: Boolean(row.is_available),
    rating: toJson(row.rating, { avg: 0, count: 0 }),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function publicOrder(row) {
  return { ...row, _id: idString(row.id), id: idString(row.id), user_id: idString(row.user_id), items: toJson(row.items, []) };
}

function publicReservation(row) {
  return { ...row, _id: idString(row.id), id: idString(row.id), user_id: row.user_id ? idString(row.user_id) : null, preorder_items: toJson(row.preorder_items, []) };
}

async function pricedItems(items) {
  const result = [];
  for (const item of items || []) {
    const [rows] = await db.execute("SELECT * FROM menu_items WHERE id = ? AND is_available = 1 LIMIT 1", [item.item_id || item.id]);
    if (!rows[0]) throw new Error("One or more menu items are unavailable");
    const quantity = Math.max(1, Number(item.quantity || 1));
    result.push({ item_id: idString(rows[0].id), name: rows[0].name, price: Number(rows[0].price), quantity, image_url: rows[0].image_url || null });
  }
  return result;
}

function total(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

const staticDir = [
  process.env.STATIC_DIR,
  path.join(__dirname, "..", "frontend"),
  path.join(__dirname, "..", "..", "frontend")
].filter(Boolean).find((candidate) => fs.existsSync(path.join(candidate, "index.html")));
if (staticDir) app.use(express.static(staticDir));

app.get("/api", (_req, res) => res.json({ name: "Cheesy Crust Co. API", version: "1.0.0-mysql", status: "online", environment: process.env.NODE_ENV || "development" }));
app.get("/health", asyncRoute(async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "healthy", database: "mysql-connected", runtime: "nodejs" });
}));

app.post(`${API_PREFIX}/auth/register`, asyncRoute(async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !phone || !password || String(password).length < 8) return res.status(400).json({ detail: "Name, email, mobile number, and 8+ character password are required" });
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = String(email).toLowerCase().trim();
  const [existing] = await db.execute("SELECT id,email,phone FROM users WHERE email = ? OR phone = ? LIMIT 1", [normalizedEmail, normalizedPhone]);
  if (existing.length) return res.status(400).json({ detail: existing[0].email === normalizedEmail ? "Email already registered" : "Mobile number already registered" });
  const { hash, salt } = hashPassword(password);
  const [result] = await db.execute("INSERT INTO users (name,email,phone,password_hash,salt,addresses,is_active,is_admin) VALUES (?,?,?,?,?,JSON_ARRAY(),1,0)", [name.trim(), normalizedEmail, normalizedPhone, hash, salt]);
  const user = await getUserById(result.insertId);
  res.status(201).json(userToken(user));
}));

app.post(`${API_PREFIX}/auth/login`, asyncRoute(async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(401).json({ detail: "Invalid email/mobile or password" });
  const field = String(identifier).includes("@") ? "email" : "phone";
  const value = field === "email" ? String(identifier).toLowerCase().trim() : normalizePhone(identifier);
  const [rows] = await db.execute(`SELECT * FROM users WHERE ${field} = ? LIMIT 1`, [value]);
  const user = rows[0];
  if (!user || !user.is_active || !verifyPassword(password, user.salt, user.password_hash)) return res.status(401).json({ detail: "Invalid email/mobile or password" });
  res.json(userToken(user));
}));

app.post(`${API_PREFIX}/auth/refresh`, asyncRoute(async (req, res) => {
  try {
    const payload = jwt.verify(req.body.refresh_token, process.env.JWT_SECRET);
    if (payload.type !== "refresh") return res.status(401).json({ detail: "Invalid refresh token" });
    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ detail: "User not found" });
    res.json(userToken(user));
  } catch {
    res.status(401).json({ detail: "Invalid refresh token" });
  }
}));
app.post(`${API_PREFIX}/auth/logout`, (_req, res) => res.json({ success: true, message: "Logged out successfully" }));

app.post(`${API_PREFIX}/admin/auth/login`, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM admins WHERE email = ? LIMIT 1", [String(req.body.email || "").toLowerCase().trim()]);
  const admin = rows[0];
  if (!admin || !admin.is_active || !verifyPassword(req.body.password, admin.salt, admin.password_hash)) return res.status(401).json({ detail: "Invalid email or password" });
  await db.execute("UPDATE admins SET last_login = NOW() WHERE id = ?", [admin.id]);
  res.json({ success: true, message: "Login successful", ...adminToken({ ...admin, last_login: new Date() }) });
}));
app.post(`${API_PREFIX}/admin/auth/logout`, adminRequired, (_req, res) => res.json({ success: true, message: "Logged out successfully" }));
app.get(`${API_PREFIX}/admin/auth/me`, adminRequired, (req, res) => res.json({ success: true, admin: adminPublic(req.admin) }));
app.post(`${API_PREFIX}/admin/auth/refresh`, asyncRoute(async (req, res) => {
  try {
    const payload = jwt.verify(req.body.refresh_token, process.env.ADMIN_JWT_SECRET);
    const [rows] = await db.execute("SELECT * FROM admins WHERE id = ? LIMIT 1", [payload.sub]);
    if (!rows[0]) return res.status(401).json({ detail: "Admin not found" });
    res.json({ success: true, message: "Token refreshed", ...adminToken(rows[0]) });
  } catch {
    res.status(401).json({ detail: "Invalid refresh token" });
  }
}));
app.put(`${API_PREFIX}/admin/auth/profile`, adminRequired, asyncRoute(async (req, res) => {
  await db.execute("UPDATE admins SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?", [req.body.name || null, req.body.email ? String(req.body.email).toLowerCase().trim() : null, req.admin.id]);
  const [rows] = await db.execute("SELECT * FROM admins WHERE id = ?", [req.admin.id]);
  res.json({ success: true, admin: adminPublic(rows[0]) });
}));
app.post(`${API_PREFIX}/admin/auth/change-password`, adminRequired, asyncRoute(async (req, res) => {
  if (!verifyPassword(req.body.current_password, req.admin.salt, req.admin.password_hash)) return res.status(400).json({ detail: "Current password is incorrect" });
  const { hash, salt } = hashPassword(req.body.new_password);
  await db.execute("UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?", [hash, salt, req.admin.id]);
  res.json({ success: true, message: "Password changed successfully" });
}));
app.post(`${API_PREFIX}/admin/auth/create`, adminRequired, asyncRoute(async (req, res) => {
  if (req.admin.role !== "super_admin") return res.status(403).json({ detail: "Super admin access required" });
  const { hash, salt } = hashPassword(req.body.password);
  const [result] = await db.execute("INSERT INTO admins (email,name,password_hash,salt,role,is_active) VALUES (?,?,?,?,?,1)", [String(req.body.email).toLowerCase().trim(), req.body.name, hash, salt, req.body.role || "admin"]);
  const [rows] = await db.execute("SELECT * FROM admins WHERE id = ?", [result.insertId]);
  res.json({ success: true, message: "Admin created", admin: adminPublic(rows[0]) });
}));
app.get(`${API_PREFIX}/admin/auth/users`, adminRequired, asyncRoute(async (_req, res) => {
  const [rows] = await db.query("SELECT * FROM admins ORDER BY created_at DESC");
  res.json({ success: true, admins: rows.map(adminPublic) });
}));

app.get(`${API_PREFIX}/menu`, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 50)));
  const where = [];
  const params = [];
  if (req.query.category) { where.push("category = ?"); params.push(req.query.category); }
  if (String(req.query.available_only) === "true") where.push("is_available = 1");
  const sqlWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM menu_items ${sqlWhere}`, params);
  const [items] = await db.query(`SELECT * FROM menu_items ${sqlWhere} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage]);
  const [cats] = await db.query("SELECT DISTINCT category FROM menu_items ORDER BY category");
  res.json({ items: items.map(publicMenu), total: count.total, categories: cats.map((c) => c.category) });
}));
app.get(`${API_PREFIX}/menu/categories`, asyncRoute(async (_req, res) => {
  const [rows] = await db.query("SELECT DISTINCT category FROM menu_items ORDER BY category");
  res.json({ success: true, categories: rows.map((r) => r.category) });
}));
app.get(`${API_PREFIX}/menu/category/:category`, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM menu_items WHERE category = ?", [req.params.category]);
  res.json({ success: true, category: req.params.category, items: rows.map(publicMenu), total: rows.length });
}));
app.get(`${API_PREFIX}/menu/:id`, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM menu_items WHERE id = ? LIMIT 1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ detail: "Menu item not found" });
  res.json(publicMenu(rows[0]));
}));
app.post(`${API_PREFIX}/menu`, adminRequired, asyncRoute(async (req, res) => {
  const slug = slugify(req.body.name);
  const rating = JSON.stringify({ avg: 0, count: 0 });
  const [result] = await db.execute("INSERT INTO menu_items (name,slug,category,price,description,image_url,is_available,rating) VALUES (?,?,?,?,?,?,?,?)", [req.body.name, slug, req.body.category, Number(req.body.price), req.body.description || "", req.body.image_url || req.body.img || "", req.body.is_available !== false ? 1 : 0, rating]);
  const [rows] = await db.execute("SELECT * FROM menu_items WHERE id = ?", [result.insertId]);
  res.status(201).json(publicMenu(rows[0]));
}));
app.put(`${API_PREFIX}/menu/:id`, adminRequired, asyncRoute(async (req, res) => {
  const fields = ["name", "category", "price", "description", "image_url", "is_available"].filter((f) => req.body[f] !== undefined);
  const updates = fields.map((f) => `${f} = ?`);
  const params = fields.map((f) => f === "is_available" ? (req.body[f] ? 1 : 0) : req.body[f]);
  if (req.body.name) { updates.push("slug = ?"); params.push(slugify(req.body.name)); }
  if (!updates.length) return res.status(400).json({ detail: "No update data" });
  params.push(req.params.id);
  await db.execute(`UPDATE menu_items SET ${updates.join(", ")} WHERE id = ?`, params);
  const [rows] = await db.execute("SELECT * FROM menu_items WHERE id = ?", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ detail: "Menu item not found" });
  res.json(publicMenu(rows[0]));
}));
app.patch(`${API_PREFIX}/menu/:id/toggle-availability`, adminRequired, asyncRoute(async (req, res) => {
  await db.execute("UPDATE menu_items SET is_available = IF(is_available=1,0,1) WHERE id = ?", [req.params.id]);
  const [rows] = await db.execute("SELECT * FROM menu_items WHERE id = ?", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ detail: "Menu item not found" });
  res.json(publicMenu(rows[0]));
}));
app.delete(`${API_PREFIX}/menu/:id`, adminRequired, asyncRoute(async (req, res) => {
  const [result] = await db.execute("DELETE FROM menu_items WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ detail: "Menu item not found" });
  res.json({ success: true, message: "Menu item deleted successfully" });
}));

async function getCart(userId) {
  const [rows] = await db.execute("SELECT * FROM carts WHERE user_id = ? LIMIT 1", [userId]);
  if (rows[0]) return { ...rows[0], items: toJson(rows[0].items, []) };
  await db.execute("INSERT INTO carts (user_id, items, total) VALUES (?, JSON_ARRAY(), 0)", [userId]);
  return { user_id: userId, items: [], total: 0 };
}
async function saveCart(userId, items) {
  await db.execute("INSERT INTO carts (user_id, items, total) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE items=VALUES(items), total=VALUES(total), updated_at=NOW()", [userId, JSON.stringify(items), total(items)]);
}
function cartResponse(cart) {
  const items = cart.items || [];
  return { _id: idString(cart.user_id), items: items.map((i) => ({ ...i, subtotal: Number(i.price) * Number(i.quantity) })), total: total(items), item_count: items.reduce((s, i) => s + Number(i.quantity), 0), updated_at: cart.updated_at || new Date() };
}
app.get(`${API_PREFIX}/cart`, authRequired, asyncRoute(async (req, res) => res.json(cartResponse(await getCart(req.user.id)))));
app.post(`${API_PREFIX}/cart/add`, authRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM menu_items WHERE id = ? AND is_available = 1 LIMIT 1", [req.body.item_id]);
  if (!rows[0]) return res.status(400).json({ detail: "Failed to add item to cart" });
  const cart = await getCart(req.user.id);
  const found = cart.items.find((i) => i.item_id === idString(rows[0].id));
  if (found) found.quantity += Number(req.body.quantity || 1);
  else cart.items.push({ item_id: idString(rows[0].id), name: rows[0].name, price: Number(rows[0].price), quantity: Number(req.body.quantity || 1), image_url: rows[0].image_url || null });
  await saveCart(req.user.id, cart.items);
  res.json({ success: true, message: "Item added to cart", cart_total: total(cart.items), item_count: cart.items.reduce((s, i) => s + i.quantity, 0) });
}));
app.put(`${API_PREFIX}/cart/update`, authRequired, asyncRoute(async (req, res) => {
  const cart = await getCart(req.user.id);
  const found = cart.items.find((i) => i.item_id === idString(req.body.item_id));
  if (!found) return res.status(400).json({ detail: "Failed to update cart item" });
  found.quantity = Number(req.body.quantity || 1);
  const items = found.quantity <= 0 ? cart.items.filter((i) => i.item_id !== idString(req.body.item_id)) : cart.items;
  await saveCart(req.user.id, items);
  res.json({ success: true, message: "Cart updated", cart_total: total(items), item_count: items.reduce((s, i) => s + i.quantity, 0) });
}));
app.delete(`${API_PREFIX}/cart/remove/:id`, authRequired, asyncRoute(async (req, res) => {
  const cart = await getCart(req.user.id);
  const items = cart.items.filter((i) => i.item_id !== idString(req.params.id));
  await saveCart(req.user.id, items);
  res.json({ success: true, message: "Item removed from cart", cart_total: total(items), item_count: items.reduce((s, i) => s + i.quantity, 0) });
}));
app.delete(`${API_PREFIX}/cart/clear`, authRequired, asyncRoute(async (req, res) => {
  await saveCart(req.user.id, []);
  res.json({ success: true, message: "Cart cleared successfully" });
}));

app.post(`${API_PREFIX}/orders/create`, authRequired, asyncRoute(async (req, res) => {
  const deliveryPincode = assertDeliveryAllowed(req.body);
  const items = await pricedItems(req.body.items);
  if (!items.length) return res.status(400).json({ detail: "Order requires at least one item" });
  const subtotal = total(items);
  const deliveryFee = req.body.order_type === "delivery" && subtotal < settings.freeDeliveryThreshold ? settings.deliveryFee : 0;
  const grand = subtotal + deliveryFee;
  const number = orderNumber();
  const deliveryAddress = req.body.order_type === "delivery" ? `${String(req.body.address).trim()}\nPIN: ${deliveryPincode}` : null;
  const [result] = await db.execute("INSERT INTO orders (order_number,user_id,items,subtotal,delivery_fee,total,order_type,address,notes,status,payment_status) VALUES (?,?,?,?,?,?,?,?,?, 'pending','pending')", [number, req.user.id, JSON.stringify(items), subtotal, deliveryFee, grand, req.body.order_type, deliveryAddress, req.body.notes || null]);
  res.json({ success: true, message: "Order created successfully", order_id: idString(result.insertId), order_number: number, total: grand });
}));
app.get(`${API_PREFIX}/orders/user`, authRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [req.user.id]);
  res.json({ success: true, orders: rows.map(publicOrder), total: rows.length });
}));
app.get(`${API_PREFIX}/orders/admin/all`, adminRequired, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const per = Math.min(100, Math.max(1, Number(req.query.per_page || 20)));
  const where = req.query.status ? "WHERE status = ?" : ""; const params = req.query.status ? [req.query.status] : [];
  const [[count]] = await db.query(`SELECT COUNT(*) total FROM orders ${where}`, params);
  const [rows] = await db.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, per, (page - 1) * per]);
  res.json({ success: true, orders: rows.map(publicOrder), total: count.total, page, per_page: per, total_pages: Math.ceil(count.total / per) });
}));
app.get(`${API_PREFIX}/orders/admin/:id`, adminRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM orders WHERE id = ? LIMIT 1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ detail: "Order not found" });
  res.json({ success: true, order: publicOrder(rows[0]) });
}));
app.patch(`${API_PREFIX}/orders/admin/:id/status`, adminRequired, asyncRoute(async (req, res) => {
  const pay = ["delivered", "completed"].includes(req.body.status) ? ", payment_status='paid'" : "";
  await db.execute(`UPDATE orders SET status = ?, notes = COALESCE(?, notes) ${pay} WHERE id = ?`, [req.body.status, req.body.notes || null, req.params.id]);
  const [rows] = await db.execute("SELECT * FROM orders WHERE id = ?", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ detail: "Order not found" });
  res.json({ success: true, message: `Order status updated to ${req.body.status}`, order: publicOrder(rows[0]) });
}));
app.get(`${API_PREFIX}/orders/:id`, authRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM orders WHERE id = ? LIMIT 1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ detail: "Order not found" });
  if (Number(rows[0].user_id) !== Number(req.user.id) && !req.user.is_admin) return res.status(403).json({ detail: "Access denied" });
  res.json({ success: true, order: publicOrder(rows[0]) });
}));

async function availability(date, time, guests) {
  if (!date || !time || !guests) return { available: false, error: "Missing date, time, or guests" };
  if (guests > settings.maxGuests) return { available: false, error: `Maximum ${settings.maxGuests} guests per table` };
  const [[count]] = await db.execute("SELECT COUNT(*) total FROM reservations WHERE date = ? AND time = ? AND status IN ('pending','confirmed')", [date, time]);
  const tables = Math.max(0, 10 - count.total);
  return { available: tables > 0, tables_available: tables, total_tables: 10 };
}
app.post(`${API_PREFIX}/reservation`, authOptional, asyncRoute(async (req, res) => {
  const ok = await availability(req.body.date, req.body.time, Number(req.body.guests));
  if (!ok.available) return res.status(400).json({ detail: ok.error || "No tables available" });
  const items = await pricedItems(req.body.preorder_items || []);
  const preorderTotal = total(items);
  const [result] = await db.execute("INSERT INTO reservations (user_id,name,phone,date,time,guests,special_requests,preorder_items,preorder_total,status,payment_status) VALUES (?,?,?,?,?,?,?,?,?,'pending',?)", [req.user ? req.user.id : null, req.body.name, normalizePhone(req.body.phone), req.body.date, req.body.time, Number(req.body.guests), req.body.special_requests || null, JSON.stringify(items), preorderTotal, preorderTotal > 0 ? "pending" : "paid"]);
  res.json({ success: true, message: "Reservation created successfully", reservation_id: idString(result.insertId), preorder_total: preorderTotal });
}));
app.get(`${API_PREFIX}/reservation/availability`, asyncRoute(async (req, res) => res.json({ success: true, ...(await availability(req.query.date, req.query.time, Number(req.query.guests))) })));
app.get(`${API_PREFIX}/reservation/slots/:date`, asyncRoute(async (req, res) => {
  const slots = [];
  for (let h = 11; h <= 22; h++) for (const m of [0, 30]) if (!(h === 22 && m > 0)) {
    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    slots.push({ time, ...(await availability(req.params.date, time, Number(req.query.guests || 2))) });
  }
  res.json({ success: true, date: req.params.date, guests: Number(req.query.guests || 2), slots });
}));
app.get(`${API_PREFIX}/reservation/user`, authRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM reservations WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  res.json({ success: true, reservations: rows.map(publicReservation), total: rows.length });
}));
app.get(`${API_PREFIX}/reservation/admin/all`, adminRequired, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const per = Math.min(100, Math.max(1, Number(req.query.per_page || 20)));
  const where = []; const params = [];
  if (req.query.date_filter) { where.push("date = ?"); params.push(req.query.date_filter); }
  if (req.query.status) { where.push("status = ?"); params.push(req.query.status); }
  const sqlWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[count]] = await db.query(`SELECT COUNT(*) total FROM reservations ${sqlWhere}`, params);
  const [rows] = await db.query(`SELECT * FROM reservations ${sqlWhere} ORDER BY date DESC, time DESC LIMIT ? OFFSET ?`, [...params, per, (page - 1) * per]);
  res.json({ success: true, reservations: rows.map(publicReservation), total: count.total, page, per_page: per, total_pages: Math.ceil(count.total / per) });
}));
app.patch(`${API_PREFIX}/reservation/admin/:id/status`, adminRequired, asyncRoute(async (req, res) => {
  await db.execute("UPDATE reservations SET status = ? WHERE id = ?", [req.query.status, req.params.id]);
  res.json({ success: true, message: `Reservation status updated to ${req.query.status}` });
}));
app.get(`${API_PREFIX}/reservation/:id`, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM reservations WHERE id = ? LIMIT 1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ detail: "Reservation not found" });
  res.json({ success: true, reservation: publicReservation(rows[0]) });
}));

async function payableAmount(amount, orderId, reservationId) {
  if (orderId) { const [rows] = await db.execute("SELECT total FROM orders WHERE id = ?", [orderId]); return rows[0] ? Number(rows[0].total) : null; }
  if (reservationId) { const [rows] = await db.execute("SELECT preorder_total FROM reservations WHERE id = ?", [reservationId]); return rows[0] ? Number(rows[0].preorder_total) : null; }
  return amount ? Number(amount) : null;
}
app.post(`${API_PREFIX}/payment/create-order`, authOptional, asyncRoute(async (req, res) => {
  const amount = await payableAmount(req.body.amount, req.body.order_id, req.body.reservation_id);
  if (!amount || amount <= 0) return res.status(400).json({ detail: "No payable amount found" });
  const rp = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: "INR", payment_capture: 1, notes: req.body.notes || {} });
  await db.execute("INSERT INTO payments (razorpay_order_id,amount,currency,status,order_id,reservation_id,notes) VALUES (?,?, 'INR','created',?,?,?)", [rp.id, amount, req.body.order_id || null, req.body.reservation_id || null, JSON.stringify(req.body.notes || {})]);
  res.json({ razorpay_order_id: rp.id, razorpay_key: process.env.RAZORPAY_KEY_ID, amount: Math.round(amount * 100), currency: "INR", order_id: req.body.order_id || null, reservation_id: req.body.reservation_id || null });
}));
app.post(`${API_PREFIX}/payment/verify`, authOptional, asyncRoute(async (req, res) => {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${req.body.razorpay_order_id}|${req.body.razorpay_payment_id}`).digest("hex");
  if (!safeCompare(expected, req.body.razorpay_signature)) return res.status(400).json({ detail: "Invalid payment signature" });
  const [rows] = await db.execute("SELECT * FROM payments WHERE razorpay_order_id = ? LIMIT 1", [req.body.razorpay_order_id]);
  if (!rows[0]) return res.status(400).json({ detail: "Payment order not found" });
  if (req.body.order_id && String(rows[0].order_id) !== String(req.body.order_id)) return res.status(400).json({ detail: "Payment does not match order" });
  if (req.body.reservation_id && String(rows[0].reservation_id) !== String(req.body.reservation_id)) return res.status(400).json({ detail: "Payment does not match reservation" });
  await db.execute("UPDATE payments SET razorpay_payment_id=?, razorpay_signature=?, status='paid', verified_at=NOW() WHERE id=?", [req.body.razorpay_payment_id, req.body.razorpay_signature, rows[0].id]);
  if (req.body.order_id) {
    await db.execute("UPDATE orders SET payment_status='paid', payment_id=?, status='confirmed' WHERE id=?", [req.body.razorpay_payment_id, req.body.order_id]);
    const [orders] = await db.execute("SELECT user_id FROM orders WHERE id=?", [req.body.order_id]);
    if (orders[0]) await saveCart(orders[0].user_id, []);
  }
  if (req.body.reservation_id) await db.execute("UPDATE reservations SET payment_status='paid', payment_id=?, status='confirmed' WHERE id=?", [req.body.razorpay_payment_id, req.body.reservation_id]);
  res.json({ success: true, message: "Payment verified successfully" });
}));
async function paymentWebhook(req, res, next) {
  try {
    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      const sig = req.headers["x-razorpay-signature"];
      const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest("hex");
      if (!sig || !safeCompare(expected, sig)) return res.status(400).json({ detail: "Invalid webhook signature" });
    }
    const event = JSON.parse(req.body.toString("utf8"));
    const orderId = event?.payload?.payment?.entity?.order_id;
    if (orderId && db) await db.execute("UPDATE payments SET last_webhook_event=?, webhook_payload=? WHERE razorpay_order_id=?", [event.event || null, JSON.stringify(event), orderId]);
    res.json({ status: "received" });
  } catch (e) { next(e); }
}

app.get(`${API_PREFIX}/user/profile`, authRequired, (req, res) => res.json({ id: idString(req.user.id), phone: req.user.phone, name: req.user.name, email: req.user.email, dob: req.user.dob, addresses: toJson(req.user.addresses, []), created_at: req.user.created_at, is_active: Boolean(req.user.is_active) }));
app.put(`${API_PREFIX}/user/profile`, authRequired, asyncRoute(async (req, res) => {
  await db.execute("UPDATE users SET name=COALESCE(?,name), email=COALESCE(?,email), dob=COALESCE(?,dob) WHERE id=?", [req.body.name || null, req.body.email || null, req.body.dob || null, req.user.id]);
  const user = await getUserById(req.user.id);
  res.json({ success: true, message: "Profile updated successfully", user: { id: idString(user.id), phone: user.phone, name: user.name, email: user.email, dob: user.dob, addresses: toJson(user.addresses, []), created_at: user.created_at, is_active: Boolean(user.is_active) } });
}));
app.get(`${API_PREFIX}/user/orders`, authRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC", [req.user.id]);
  res.json({ success: true, orders: rows.map(publicOrder), total: rows.length });
}));
app.get(`${API_PREFIX}/user/reservations`, authRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM reservations WHERE user_id=? ORDER BY created_at DESC", [req.user.id]);
  res.json({ success: true, reservations: rows.map(publicReservation), total: rows.length });
}));

app.get(`${API_PREFIX}/admin/dashboard`, adminRequired, asyncRoute(async (_req, res) => {
  const [[u]] = await db.query("SELECT COUNT(*) total FROM users");
  const [[o]] = await db.query("SELECT COUNT(*) total FROM orders");
  const [[r]] = await db.query("SELECT COUNT(*) total FROM reservations");
  const [[to]] = await db.query("SELECT COUNT(*) total FROM orders WHERE DATE(created_at)=CURDATE()");
  const [[rev]] = await db.query("SELECT COALESCE(SUM(total),0) total_revenue, COALESCE(AVG(total),0) avg_order_value FROM orders WHERE payment_status='paid'");
  const [recent] = await db.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5");
  res.json({ success: true, stats: { total_users: u.total, total_orders: o.total, total_reservations: r.total, today_orders: to.total, total_revenue: Number(rev.total_revenue), avg_order_value: Number(rev.avg_order_value), today_revenue: 0 }, recent_orders: recent.map(publicOrder) });
}));
app.get(`${API_PREFIX}/admin/sales-summary`, adminRequired, asyncRoute(async (_req, res) => {
  const [sales] = await db.query("SELECT DATE(created_at) _id, SUM(total) revenue, COUNT(*) orders FROM orders WHERE payment_status='paid' GROUP BY DATE(created_at) ORDER BY _id LIMIT 30");
  res.json({ success: true, sales_data: sales, top_items: [] });
}));
app.get(`${API_PREFIX}/admin/users`, adminRequired, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const per = Math.min(100, Math.max(1, Number(req.query.per_page || 20)));
  const search = req.query.search ? `%${req.query.search}%` : null;
  const where = search ? "WHERE phone LIKE ? OR name LIKE ? OR email LIKE ?" : "";
  const params = search ? [search, search, search] : [];
  const [[count]] = await db.query(`SELECT COUNT(*) total FROM users ${where}`, params);
  const [rows] = await db.query(`SELECT id,phone,email,name,dob,addresses,is_active,is_admin,created_at,updated_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, per, (page - 1) * per]);
  res.json({ success: true, users: rows.map((u) => ({ ...u, _id: idString(u.id), order_count: 0, addresses: toJson(u.addresses, []) })), total: count.total, page, per_page: per, total_pages: Math.ceil(count.total / per) });
}));
app.get(`${API_PREFIX}/admin/customer-stats`, adminRequired, asyncRoute(async (_req, res) => {
  const [[t]] = await db.query("SELECT COUNT(*) total FROM users"); const [[a]] = await db.query("SELECT COUNT(*) total FROM users WHERE is_active=1"); const [[w]] = await db.query("SELECT COUNT(DISTINCT user_id) total FROM orders");
  res.json({ success: true, stats: { total: t.total, active: a.total, inactive: t.total - a.total, with_orders: w.total } });
}));
app.patch(`${API_PREFIX}/admin/users/:id/status`, adminRequired, asyncRoute(async (req, res) => {
  await db.execute("UPDATE users SET is_active=? WHERE id=?", [req.body.is_active ? 1 : 0, req.params.id]);
  res.json({ success: true, message: "Customer status updated" });
}));
app.get(`${API_PREFIX}/admin/users/:id/orders`, adminRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC", [req.params.id]);
  res.json({ success: true, orders: rows.map(publicOrder), total: rows.length });
}));
app.get(`${API_PREFIX}/admin/users/:id/reservations`, adminRequired, asyncRoute(async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM reservations WHERE user_id=? ORDER BY created_at DESC", [req.params.id]);
  res.json({ success: true, reservations: rows.map(publicReservation), total: rows.length });
}));
app.get(`${API_PREFIX}/admin/order-stats`, adminRequired, asyncRoute(async (_req, res) => {
  const [rows] = await db.query("SELECT status _id, COUNT(*) count FROM orders GROUP BY status");
  res.json({ success: true, stats: Object.fromEntries(rows.map((r) => [r._id, r.count])), total: rows.reduce((s, r) => s + r.count, 0) });
}));
app.get(`${API_PREFIX}/admin/settings`, adminRequired, asyncRoute(async (_req, res) => {
  const [rows] = await db.execute("SELECT data FROM settings WHERE id='restaurant'");
  res.json({ success: true, settings: toJson(rows[0]?.data, { restaurantName: settings.restaurantName, deliveryFee: settings.deliveryFee, freeDeliveryThreshold: settings.freeDeliveryThreshold, maxGuests: settings.maxGuests }) });
}));
app.put(`${API_PREFIX}/admin/settings`, adminRequired, asyncRoute(async (req, res) => {
  await db.execute("INSERT INTO settings (id,data) VALUES ('restaurant',?) ON DUPLICATE KEY UPDATE data=VALUES(data)", [JSON.stringify(req.body)]);
  res.json({ success: true, settings: req.body });
}));
for (const key of ["business-hours", "delivery", "notifications"]) {
  app.get(`${API_PREFIX}/admin/settings/${key}`, adminRequired, asyncRoute(async (_req, res) => {
    const [rows] = await db.execute("SELECT data FROM settings WHERE id=?", [key]);
    res.json({ success: true, [key.replace("-", "_")]: toJson(rows[0]?.data, { id: key }) });
  }));
  app.put(`${API_PREFIX}/admin/settings/${key}`, adminRequired, asyncRoute(async (req, res) => {
    await db.execute("INSERT INTO settings (id,data) VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)", [key, JSON.stringify(req.body)]);
    res.json({ success: true, [key.replace("-", "_")]: req.body });
  }));
}
app.get(`${API_PREFIX}/admin/offers`, adminRequired, asyncRoute(async (_req, res) => {
  const [rows] = await db.query("SELECT * FROM offers ORDER BY created_at DESC");
  res.json({ success: true, offers: rows.map((o) => ({ ...o, _id: idString(o.id), data: toJson(o.data, {}) })) });
}));
app.get(`${API_PREFIX}/admin/offers/active`, asyncRoute(async (_req, res) => {
  const [rows] = await db.query("SELECT * FROM offers WHERE is_active=1 ORDER BY created_at DESC");
  res.json({ success: true, offers: rows.map((o) => ({ ...o, _id: idString(o.id), data: toJson(o.data, {}) })) });
}));
app.post(`${API_PREFIX}/admin/offers`, adminRequired, asyncRoute(async (req, res) => {
  const [result] = await db.execute("INSERT INTO offers (title,description,discount_type,discount_value,is_active,data) VALUES (?,?,?,?,?,?)", [req.body.title || "Offer", req.body.description || null, req.body.discount_type || null, req.body.discount_value || null, req.body.is_active === false ? 0 : 1, JSON.stringify(req.body)]);
  res.json({ success: true, offer: { ...req.body, id: idString(result.insertId), _id: idString(result.insertId) } });
}));
app.put(`${API_PREFIX}/admin/offers/:id`, adminRequired, asyncRoute(async (req, res) => {
  await db.execute("UPDATE offers SET title=COALESCE(?,title), description=COALESCE(?,description), is_active=COALESCE(?,is_active), data=? WHERE id=?", [req.body.title || null, req.body.description || null, req.body.is_active === undefined ? null : (req.body.is_active ? 1 : 0), JSON.stringify(req.body), req.params.id]);
  res.json({ success: true, offer: { ...req.body, id: req.params.id, _id: req.params.id } });
}));
app.patch(`${API_PREFIX}/admin/offers/:id/toggle`, adminRequired, asyncRoute(async (req, res) => {
  await db.execute("UPDATE offers SET is_active=IF(is_active=1,0,1) WHERE id=?", [req.params.id]);
  res.json({ success: true, message: "Offer updated" });
}));
app.delete(`${API_PREFIX}/admin/offers/:id`, adminRequired, asyncRoute(async (req, res) => {
  await db.execute("DELETE FROM offers WHERE id=?", [req.params.id]);
  res.json({ success: true, message: "Offer deleted" });
}));
app.get(`${API_PREFIX}/admin/reviews`, adminRequired, asyncRoute(async (_req, res) => {
  const [rows] = await db.query("SELECT * FROM reviews ORDER BY created_at DESC");
  res.json({ success: true, reviews: rows.map((r) => ({ ...r, _id: idString(r.id) })), total: rows.length });
}));
app.get(`${API_PREFIX}/admin/reviews/pending`, adminRequired, asyncRoute(async (_req, res) => {
  const [rows] = await db.query("SELECT * FROM reviews WHERE approved=0 ORDER BY created_at DESC");
  res.json({ success: true, reviews: rows.map((r) => ({ ...r, _id: idString(r.id) })), total: rows.length });
}));
app.get(`${API_PREFIX}/admin/review-stats`, adminRequired, asyncRoute(async (_req, res) => {
  const [[t]] = await db.query("SELECT COUNT(*) total FROM reviews"); const [[p]] = await db.query("SELECT COUNT(*) total FROM reviews WHERE approved=0"); const [[a]] = await db.query("SELECT COUNT(*) total FROM reviews WHERE approved=1");
  res.json({ success: true, stats: { total: t.total, pending: p.total, approved: a.total } });
}));
app.patch(`${API_PREFIX}/admin/reviews/:id/approve`, adminRequired, asyncRoute(async (req, res) => { await db.execute("UPDATE reviews SET approved=1 WHERE id=?", [req.params.id]); res.json({ success: true, message: "Review approved" }); }));
app.patch(`${API_PREFIX}/admin/reviews/:id/reject`, adminRequired, asyncRoute(async (req, res) => { await db.execute("UPDATE reviews SET approved=0,rejected=1 WHERE id=?", [req.params.id]); res.json({ success: true, message: "Review rejected" }); }));
app.delete(`${API_PREFIX}/admin/reviews/:id`, adminRequired, asyncRoute(async (req, res) => { await db.execute("DELETE FROM reviews WHERE id=?", [req.params.id]); res.json({ success: true, message: "Review deleted" }); }));

if (staticDir) {
  app.get("*", (req, res, next) => {
    if (req.path.startsWith(API_PREFIX)) return next();
    return res.sendFile(path.join(staticDir, "index.html"));
  });
}
app.use((req, res) => res.status(404).json({ detail: "Not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ detail: err.message || "Internal server error" });
});

async function start() {
  const required = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE", "JWT_SECRET", "ADMIN_JWT_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  db = await mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_LIMIT || 10),
    namedPlaceholders: false
  });
  razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  await migrate();
  await ensureAdmin();
  await ensureDefaultMenu();
  app.listen(PORT, () => console.log(`Cheesy Crust MySQL API listening on ${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
