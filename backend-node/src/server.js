require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const Razorpay = require("razorpay");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_PREFIX = process.env.API_PREFIX || "/api/v1";

const requiredEnv = ["MONGODB_URI", "JWT_SECRET", "ADMIN_JWT_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.warn(`Missing env values: ${missingEnv.join(", ")}`);
}

const settings = {
  dbName: process.env.MONGODB_DB_NAME || "cheesy_crust",
  restaurantName: process.env.RESTAURANT_NAME || "Cheesy Crust Co.",
  deliveryFee: Number(process.env.DELIVERY_FEE || 40),
  freeDeliveryThreshold: Number(process.env.FREE_DELIVERY_THRESHOLD || 500),
  maxGuests: Number(process.env.MAX_GUESTS_PER_TABLE || 8),
  jwtExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "7d",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  adminEmail: (process.env.ADMIN_EMAIL || "admin@cheesycrust.co").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@123456"
};

const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:5500,http://localhost:8000,http://127.0.0.1:5500,http://127.0.0.1:8000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (corsOrigins.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "whitesmoke-jay-438498.hostingersite.com" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true
}));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.post(`${API_PREFIX}/payment/webhook`, express.raw({ type: "*/*" }), paymentWebhook);
app.use(express.json({ limit: "1mb" }));

let db;
let collections;
let razorpay;

function now() {
  return new Date();
}

function objectId(id) {
  if (!ObjectId.isValid(String(id || ""))) return null;
  return new ObjectId(String(id));
}

function serialize(value) {
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    if (value instanceof ObjectId) return value.toString();
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) throw new Error("Invalid phone number");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return String(phone).startsWith("+") ? `+${digits}` : `+${digits}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, storedHash) {
  if (!salt || !storedHash) return false;
  const { hash } = hashPassword(password, salt);
  if (safeCompare(hash, storedHash)) return true;
  const legacyHash = crypto.createHash("sha256").update(String(password) + salt).digest("hex");
  return safeCompare(legacyHash, storedHash);
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createToken(payload, secret, expiresIn) {
  return jwt.sign(payload, secret, { expiresIn });
}

function tokenPairForUser(user) {
  const payload = {
    sub: user._id.toString(),
    phone: user.phone,
    email: user.email,
    is_admin: Boolean(user.is_admin)
  };
  return {
    access_token: createToken({ ...payload, type: "access" }, process.env.JWT_SECRET, settings.jwtExpiresIn),
    refresh_token: createToken({ ...payload, type: "refresh" }, process.env.JWT_SECRET, settings.refreshExpiresIn),
    token_type: "bearer",
    expires_in: 7 * 24 * 60 * 60,
    user_id: user._id.toString(),
    phone: user.phone,
    email: user.email,
    name: user.name,
    is_admin: Boolean(user.is_admin)
  };
}

function tokenPairForAdmin(admin) {
  const payload = {
    sub: admin._id.toString(),
    email: admin.email,
    name: admin.name,
    role: admin.role || "admin",
    type: "admin"
  };
  return {
    access_token: createToken(payload, process.env.ADMIN_JWT_SECRET, "24h"),
    refresh_token: createToken(payload, process.env.ADMIN_JWT_SECRET, "7d"),
    token_type: "bearer",
    expires_in: 86400,
    admin: publicAdmin(admin)
  };
}

function publicAdmin(admin) {
  return serialize({
    id: admin._id,
    email: admin.email,
    name: admin.name,
    role: admin.role || "admin",
    is_active: admin.is_active !== false,
    last_login: admin.last_login,
    created_at: admin.created_at
  });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function authRequired(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(403).json({ detail: "Missing token" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await collections.users.findOne({ _id: objectId(payload.sub) });
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
      req.user = await collections.users.findOne({ _id: objectId(payload.sub) });
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
    if (payload.type !== "admin") return res.status(401).json({ detail: "Invalid admin token" });
    const admin = await collections.admins.findOne({ _id: objectId(payload.sub) });
    if (!admin || admin.is_active === false) return res.status(401).json({ detail: "Admin not found or inactive" });
    req.admin = admin;
    req.adminPayload = payload;
    return next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired admin token" });
  }
}

async function ensureIndexes() {
  await safeCreateIndex(collections.users, { phone: 1 }, { unique: true });
  await safeCreateIndex(collections.users, { email: 1 }, { sparse: true });
  await safeCreateIndex(collections.admins, { email: 1 }, { unique: true });
  await safeCreateIndex(collections.menu_items, { slug: 1 }, { unique: true });
  await safeCreateIndex(collections.menu_items, { category: 1 });
  await safeCreateIndex(collections.menu_items, { is_available: 1 });
  await safeCreateIndex(collections.carts, { user_id: 1 }, { unique: true });
  await safeCreateIndex(collections.orders, { order_number: 1 }, { unique: true });
  await safeCreateIndex(collections.orders, { user_id: 1 });
  await safeCreateIndex(collections.orders, { status: 1 });
  await safeCreateIndex(collections.reservations, { phone: 1 });
  await safeCreateIndex(collections.reservations, { date: -1 });
  await safeCreateIndex(collections.payments, { razorpay_order_id: 1 }, { unique: true });
}

async function safeCreateIndex(collection, keys, options = {}) {
  try {
    await collection.createIndex(keys, options);
  } catch (error) {
    if (error.code === 85 || error.code === 86) {
      console.warn(`Keeping existing MongoDB index for ${collection.collectionName}: ${JSON.stringify(keys)}`);
      return;
    }
    throw error;
  }
}

async function ensureDefaultAdmin() {
  const existing = await collections.admins.findOne({ email: settings.adminEmail });
  if (existing) return;
  const { hash, salt } = hashPassword(settings.adminPassword);
  await collections.admins.insertOne({
    email: settings.adminEmail,
    name: "Super Admin",
    password_hash: hash,
    salt,
    role: "super_admin",
    is_active: true,
    created_at: now(),
    updated_at: now()
  });
}

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function generateOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CC${stamp}${random}`;
}

async function priceOrderItems(items) {
  const priced = [];
  for (const item of items || []) {
    const id = objectId(item.item_id || item.id);
    if (!id) throw new Error("Invalid item id");
    const menuItem = await collections.menu_items.findOne({ _id: id, is_available: { $ne: false } });
    if (!menuItem) throw new Error("One or more menu items are unavailable");
    const quantity = Math.max(1, Number(item.quantity || 1));
    priced.push({
      item_id: menuItem._id.toString(),
      name: menuItem.name,
      price: Number(menuItem.price),
      quantity,
      image_url: menuItem.image_url || null
    });
  }
  return priced;
}

function cartTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

function menuResponse(item) {
  return serialize({
    ...item,
    id: item._id
  });
}

const staticDir = [
  process.env.STATIC_DIR,
  path.join(__dirname, "..", "frontend"),
  path.join(__dirname, "..", "..", "frontend"),
  path.join(__dirname, "..", "..", "public_html", "frontend")
].filter(Boolean).find((candidate) => fs.existsSync(path.join(candidate, "index.html")));

if (staticDir) {
  app.use(express.static(staticDir));
}

app.get("/api", (_req, res) => {
  res.json({ name: "Cheesy Crust Co. API", version: "1.0.0-node", status: "online", environment: process.env.NODE_ENV || "development" });
});

app.get("/health", asyncRoute(async (_req, res) => {
  await db.command({ ping: 1 });
  res.json({ status: "healthy", database: "connected", runtime: "nodejs" });
}));

app.post(`${API_PREFIX}/auth/register`, asyncRoute(async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !phone || !password || String(password).length < 8) {
    return res.status(400).json({ detail: "Name, email, mobile number, and 8+ character password are required" });
  }
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await collections.users.findOne({ $or: [{ email: normalizedEmail }, { phone: normalizedPhone }] });
  if (existing) return res.status(400).json({ detail: existing.email === normalizedEmail ? "Email already registered" : "Mobile number already registered" });
  const { hash, salt } = hashPassword(password);
  const user = {
    name: String(name).trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    password_hash: hash,
    salt,
    addresses: [],
    is_active: true,
    is_admin: false,
    created_at: now(),
    updated_at: now()
  };
  const result = await collections.users.insertOne(user);
  user._id = result.insertedId;
  return res.status(201).json(tokenPairForUser(user));
}));

app.post(`${API_PREFIX}/auth/login`, asyncRoute(async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(401).json({ detail: "Invalid email/mobile or password" });
  let query;
  if (String(identifier).includes("@")) query = { email: String(identifier).toLowerCase().trim() };
  else query = { phone: normalizePhone(identifier) };
  const user = await collections.users.findOne(query);
  if (!user || user.is_active === false || !verifyPassword(password, user.salt, user.password_hash)) {
    return res.status(401).json({ detail: "Invalid email/mobile or password" });
  }
  return res.json(tokenPairForUser(user));
}));

app.post(`${API_PREFIX}/auth/refresh`, asyncRoute(async (req, res) => {
  try {
    const payload = jwt.verify(req.body.refresh_token, process.env.JWT_SECRET);
    if (payload.type !== "refresh") return res.status(401).json({ detail: "Invalid refresh token" });
    const user = await collections.users.findOne({ _id: objectId(payload.sub) });
    if (!user) return res.status(401).json({ detail: "User not found" });
    return res.json(tokenPairForUser(user));
  } catch {
    return res.status(401).json({ detail: "Invalid refresh token" });
  }
}));

app.post(`${API_PREFIX}/auth/logout`, (_req, res) => res.json({ success: true, message: "Logged out successfully" }));

app.post(`${API_PREFIX}/admin/auth/login`, asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const password = String(req.body.password || "");
  const admin = await collections.admins.findOne({ email });
  if (!admin || admin.is_active === false || !verifyPassword(password, admin.salt, admin.password_hash)) {
    return res.status(401).json({ detail: "Invalid email or password" });
  }
  await collections.admins.updateOne({ _id: admin._id }, { $set: { last_login: now() } });
  return res.json({ success: true, message: "Login successful", ...tokenPairForAdmin({ ...admin, last_login: now() }) });
}));

app.post(`${API_PREFIX}/admin/auth/logout`, adminRequired, (_req, res) => res.json({ success: true, message: "Logged out successfully" }));

app.get(`${API_PREFIX}/admin/auth/me`, adminRequired, (req, res) => res.json({ success: true, admin: publicAdmin(req.admin) }));

app.post(`${API_PREFIX}/admin/auth/refresh`, asyncRoute(async (req, res) => {
  try {
    const payload = jwt.verify(req.body.refresh_token, process.env.ADMIN_JWT_SECRET);
    if (payload.type !== "admin") return res.status(401).json({ detail: "Invalid refresh token" });
    const admin = await collections.admins.findOne({ _id: objectId(payload.sub) });
    if (!admin || admin.is_active === false) return res.status(401).json({ detail: "Admin not found or inactive" });
    return res.json({ success: true, message: "Token refreshed", ...tokenPairForAdmin(admin) });
  } catch {
    return res.status(401).json({ detail: "Invalid refresh token" });
  }
}));

app.put(`${API_PREFIX}/admin/auth/profile`, adminRequired, asyncRoute(async (req, res) => {
  const update = {};
  if (req.body.name) update.name = String(req.body.name).trim();
  if (req.body.email) update.email = String(req.body.email).toLowerCase().trim();
  update.updated_at = now();
  await collections.admins.updateOne({ _id: req.admin._id }, { $set: update });
  const admin = await collections.admins.findOne({ _id: req.admin._id });
  res.json({ success: true, admin: publicAdmin(admin) });
}));

app.post(`${API_PREFIX}/admin/auth/change-password`, adminRequired, asyncRoute(async (req, res) => {
  if (!verifyPassword(req.body.current_password, req.admin.salt, req.admin.password_hash)) {
    return res.status(400).json({ detail: "Current password is incorrect" });
  }
  const { hash, salt } = hashPassword(req.body.new_password);
  await collections.admins.updateOne({ _id: req.admin._id }, { $set: { password_hash: hash, salt, updated_at: now() } });
  res.json({ success: true, message: "Password changed successfully" });
}));

app.post(`${API_PREFIX}/admin/auth/create`, adminRequired, asyncRoute(async (req, res) => {
  if (req.admin.role !== "super_admin") return res.status(403).json({ detail: "Super admin access required" });
  const { email, password, name, role = "admin" } = req.body || {};
  const { hash, salt } = hashPassword(password);
  const admin = { email: String(email).toLowerCase().trim(), name, role, password_hash: hash, salt, is_active: true, created_at: now(), updated_at: now() };
  const result = await collections.admins.insertOne(admin);
  admin._id = result.insertedId;
  res.json({ success: true, message: "Admin created", admin: publicAdmin(admin) });
}));

app.get(`${API_PREFIX}/admin/auth/users`, adminRequired, asyncRoute(async (_req, res) => {
  const admins = await collections.admins.find().sort({ created_at: -1 }).toArray();
  res.json({ success: true, admins: admins.map(publicAdmin) });
}));

app.get(`${API_PREFIX}/menu`, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 50)));
  const query = {};
  if (req.query.category) query.category = req.query.category;
  if (String(req.query.available_only) === "true") query.is_available = { $ne: false };
  const total = await collections.menu_items.countDocuments(query);
  const items = await collections.menu_items.find(query).skip((page - 1) * perPage).limit(perPage).toArray();
  const categories = await collections.menu_items.distinct("category");
  res.json({ items: items.map(menuResponse), total, categories });
}));

app.get(`${API_PREFIX}/menu/categories`, asyncRoute(async (_req, res) => {
  res.json({ success: true, categories: await collections.menu_items.distinct("category") });
}));

app.get(`${API_PREFIX}/menu/category/:category`, asyncRoute(async (req, res) => {
  const items = await collections.menu_items.find({ category: req.params.category }).toArray();
  res.json({ success: true, category: req.params.category, items: items.map(menuResponse), total: items.length });
}));

app.get(`${API_PREFIX}/menu/:itemId`, asyncRoute(async (req, res) => {
  const id = objectId(req.params.itemId);
  const item = id ? await collections.menu_items.findOne({ _id: id }) : null;
  if (!item) return res.status(404).json({ detail: "Menu item not found" });
  res.json(menuResponse(item));
}));

app.post(`${API_PREFIX}/menu`, adminRequired, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const item = {
    name: body.name,
    slug: slugify(body.name),
    category: body.category,
    price: Number(body.price),
    description: body.description || "",
    image_url: body.image_url || body.img || "",
    is_available: body.is_available !== false,
    rating: { avg: 0, count: 0 },
    created_at: now(),
    updated_at: now()
  };
  const result = await collections.menu_items.insertOne(item);
  item._id = result.insertedId;
  res.status(201).json(menuResponse(item));
}));

app.put(`${API_PREFIX}/menu/:itemId`, adminRequired, asyncRoute(async (req, res) => {
  const id = objectId(req.params.itemId);
  if (!id) return res.status(400).json({ detail: "Invalid item id" });
  const update = { ...req.body, updated_at: now() };
  if (update.name) update.slug = slugify(update.name);
  const result = await collections.menu_items.findOneAndUpdate({ _id: id }, { $set: update }, { returnDocument: "after" });
  if (!result) return res.status(404).json({ detail: "Menu item not found" });
  res.json(menuResponse(result));
}));

app.patch(`${API_PREFIX}/menu/:itemId/toggle-availability`, adminRequired, asyncRoute(async (req, res) => {
  const id = objectId(req.params.itemId);
  const item = id ? await collections.menu_items.findOne({ _id: id }) : null;
  if (!item) return res.status(404).json({ detail: "Menu item not found" });
  const result = await collections.menu_items.findOneAndUpdate({ _id: id }, { $set: { is_available: item.is_available === false, updated_at: now() } }, { returnDocument: "after" });
  res.json(menuResponse(result));
}));

app.delete(`${API_PREFIX}/menu/:itemId`, adminRequired, asyncRoute(async (req, res) => {
  const id = objectId(req.params.itemId);
  const result = id ? await collections.menu_items.deleteOne({ _id: id }) : { deletedCount: 0 };
  if (!result.deletedCount) return res.status(404).json({ detail: "Menu item not found" });
  res.json({ success: true, message: "Menu item deleted successfully" });
}));

app.get(`${API_PREFIX}/cart`, authRequired, asyncRoute(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  res.json(formatCart(cart));
}));

app.post(`${API_PREFIX}/cart/add`, authRequired, asyncRoute(async (req, res) => {
  const itemId = objectId(req.body.item_id);
  const menuItem = itemId ? await collections.menu_items.findOne({ _id: itemId, is_available: { $ne: false } }) : null;
  if (!menuItem) return res.status(400).json({ detail: "Failed to add item to cart" });
  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((item) => item.item_id === menuItem._id.toString());
  if (existing) existing.quantity += Number(req.body.quantity || 1);
  else cart.items.push({ item_id: menuItem._id.toString(), name: menuItem.name, price: Number(menuItem.price), quantity: Number(req.body.quantity || 1), image_url: menuItem.image_url || null });
  await saveCart(req.user._id, cart.items);
  res.json({ success: true, message: "Item added to cart", cart_total: cartTotal(cart.items), item_count: cart.items.reduce((sum, item) => sum + item.quantity, 0) });
}));

app.put(`${API_PREFIX}/cart/update`, authRequired, asyncRoute(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const item = cart.items.find((entry) => entry.item_id === req.body.item_id);
  if (!item) return res.status(400).json({ detail: "Failed to update cart item" });
  item.quantity = Number(req.body.quantity || 1);
  if (item.quantity <= 0) cart.items = cart.items.filter((entry) => entry.item_id !== req.body.item_id);
  await saveCart(req.user._id, cart.items);
  res.json({ success: true, message: "Cart updated", cart_total: cartTotal(cart.items), item_count: cart.items.reduce((sum, entry) => sum + entry.quantity, 0) });
}));

app.delete(`${API_PREFIX}/cart/remove/:itemId`, authRequired, asyncRoute(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const items = cart.items.filter((item) => item.item_id !== req.params.itemId);
  await saveCart(req.user._id, items);
  res.json({ success: true, message: "Item removed from cart", cart_total: cartTotal(items), item_count: items.reduce((sum, item) => sum + item.quantity, 0) });
}));

app.delete(`${API_PREFIX}/cart/clear`, authRequired, asyncRoute(async (req, res) => {
  await saveCart(req.user._id, []);
  res.json({ success: true, message: "Cart cleared successfully" });
}));

async function getOrCreateCart(userId) {
  let cart = await collections.carts.findOne({ user_id: userId });
  if (!cart) {
    cart = { user_id: userId, items: [], total: 0, updated_at: now() };
    const result = await collections.carts.insertOne(cart);
    cart._id = result.insertedId;
  }
  return cart;
}

async function saveCart(userId, items) {
  const total = cartTotal(items);
  await collections.carts.updateOne({ user_id: userId }, { $set: { items, total, updated_at: now() } }, { upsert: true });
}

function formatCart(cart) {
  const items = cart.items || [];
  return serialize({ _id: cart._id, items: items.map((item) => ({ ...item, subtotal: Number(item.price) * Number(item.quantity) })), total: cartTotal(items), item_count: items.reduce((sum, item) => sum + item.quantity, 0), updated_at: cart.updated_at || now() });
}

app.post(`${API_PREFIX}/orders/create`, authRequired, asyncRoute(async (req, res) => {
  const items = await priceOrderItems(req.body.items);
  if (!items.length) return res.status(400).json({ detail: "Order requires at least one item" });
  const subtotal = cartTotal(items);
  const deliveryFee = req.body.order_type === "delivery" && subtotal < settings.freeDeliveryThreshold ? settings.deliveryFee : 0;
  const total = subtotal + deliveryFee;
  const order = {
    order_number: generateOrderNumber(),
    user_id: req.user._id,
    items,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    order_type: req.body.order_type,
    address: req.body.address || null,
    notes: req.body.notes || null,
    status: "pending",
    payment_status: "pending",
    created_at: now(),
    updated_at: now()
  };
  const result = await collections.orders.insertOne(order);
  order._id = result.insertedId;
  res.json({ success: true, message: "Order created successfully", order_id: order._id.toString(), order_number: order.order_number, total });
}));

app.get(`${API_PREFIX}/orders/user`, authRequired, asyncRoute(async (req, res) => {
  const orders = await collections.orders.find({ user_id: req.user._id }).sort({ created_at: -1 }).limit(50).toArray();
  res.json({ success: true, orders: serialize(orders), total: orders.length });
}));

app.get(`${API_PREFIX}/orders/admin/all`, adminRequired, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 20)));
  const query = req.query.status ? { status: req.query.status } : {};
  const total = await collections.orders.countDocuments(query);
  const orders = await collections.orders.find(query).sort({ created_at: -1 }).skip((page - 1) * perPage).limit(perPage).toArray();
  res.json({ success: true, orders: serialize(orders), total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) });
}));

app.get(`${API_PREFIX}/orders/admin/:orderId`, adminRequired, asyncRoute(async (req, res) => {
  const order = await collections.orders.findOne({ _id: objectId(req.params.orderId) });
  if (!order) return res.status(404).json({ detail: "Order not found" });
  res.json({ success: true, order: serialize(order) });
}));

app.patch(`${API_PREFIX}/orders/admin/:orderId/status`, adminRequired, asyncRoute(async (req, res) => {
  const update = { status: req.body.status, updated_at: now() };
  if (req.body.notes) update.notes = req.body.notes;
  if (["delivered", "completed"].includes(req.body.status)) update.payment_status = "paid";
  const result = await collections.orders.findOneAndUpdate({ _id: objectId(req.params.orderId) }, { $set: update }, { returnDocument: "after" });
  if (!result) return res.status(404).json({ detail: "Order not found" });
  res.json({ success: true, message: `Order status updated to ${req.body.status}`, order: serialize(result) });
}));

app.get(`${API_PREFIX}/orders/:orderId`, authRequired, asyncRoute(async (req, res) => {
  const order = await collections.orders.findOne({ _id: objectId(req.params.orderId) });
  if (!order) return res.status(404).json({ detail: "Order not found" });
  if (!order.user_id.equals(req.user._id) && !req.user.is_admin) return res.status(403).json({ detail: "Access denied" });
  res.json({ success: true, order: serialize(order) });
}));

app.post(`${API_PREFIX}/reservation`, authOptional, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const available = await checkAvailability(body.date, body.time, Number(body.guests));
  if (!available.available) return res.status(400).json({ detail: available.error || "No tables available" });
  const preorderItems = await priceOrderItems(body.preorder_items || []);
  const preorderTotal = cartTotal(preorderItems);
  const reservation = {
    user_id: req.user ? req.user._id : null,
    name: body.name,
    phone: normalizePhone(body.phone),
    date: body.date,
    time: body.time,
    guests: Number(body.guests),
    special_requests: body.special_requests || null,
    preorder_items: preorderItems,
    preorder_total: preorderTotal,
    status: "pending",
    payment_status: preorderTotal > 0 ? "pending" : "paid",
    created_at: now(),
    updated_at: now()
  };
  const result = await collections.reservations.insertOne(reservation);
  reservation._id = result.insertedId;
  res.json({ success: true, message: "Reservation created successfully", reservation_id: reservation._id.toString(), preorder_total: preorderTotal });
}));

app.get(`${API_PREFIX}/reservation/availability`, asyncRoute(async (req, res) => {
  res.json({ success: true, ...(await checkAvailability(req.query.date, req.query.time, Number(req.query.guests))) });
}));

app.get(`${API_PREFIX}/reservation/slots/:date`, asyncRoute(async (req, res) => {
  const slots = [];
  for (let hour = 11; hour <= 22; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 22 && minute > 0) continue;
      const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      slots.push({ time, ...(await checkAvailability(req.params.date, time, Number(req.query.guests || 2))) });
    }
  }
  res.json({ success: true, date: req.params.date, guests: Number(req.query.guests || 2), slots });
}));

app.get(`${API_PREFIX}/reservation/user`, authRequired, asyncRoute(async (req, res) => {
  const reservations = await collections.reservations.find({ user_id: req.user._id }).sort({ created_at: -1 }).toArray();
  res.json({ success: true, reservations: serialize(reservations), total: reservations.length });
}));

app.get(`${API_PREFIX}/reservation/admin/all`, adminRequired, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 20)));
  const query = {};
  if (req.query.date_filter) query.date = req.query.date_filter;
  if (req.query.status) query.status = req.query.status;
  const total = await collections.reservations.countDocuments(query);
  const reservations = await collections.reservations.find(query).sort({ date: -1, time: -1 }).skip((page - 1) * perPage).limit(perPage).toArray();
  res.json({ success: true, reservations: serialize(reservations), total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) });
}));

app.patch(`${API_PREFIX}/reservation/admin/:reservationId/status`, adminRequired, asyncRoute(async (req, res) => {
  const result = await collections.reservations.updateOne({ _id: objectId(req.params.reservationId) }, { $set: { status: req.query.status, updated_at: now() } });
  if (!result.matchedCount) return res.status(404).json({ detail: "Reservation not found" });
  res.json({ success: true, message: `Reservation status updated to ${req.query.status}` });
}));

app.get(`${API_PREFIX}/reservation/:reservationId`, asyncRoute(async (req, res) => {
  const reservation = await collections.reservations.findOne({ _id: objectId(req.params.reservationId) });
  if (!reservation) return res.status(404).json({ detail: "Reservation not found" });
  res.json({ success: true, reservation: serialize(reservation) });
}));

async function checkAvailability(date, time, guests) {
  if (!date || !time || !guests) return { available: false, error: "Missing date, time, or guests" };
  if (guests > settings.maxGuests) return { available: false, error: `Maximum ${settings.maxGuests} guests per table` };
  const existing = await collections.reservations.countDocuments({ date, time, status: { $in: ["confirmed", "pending"] } });
  const tablesAvailable = Math.max(0, 10 - existing);
  return { available: tablesAvailable > 0, tables_available: tablesAvailable, total_tables: 10 };
}

app.post(`${API_PREFIX}/payment/create-order`, authOptional, asyncRoute(async (req, res) => {
  const amount = await resolvePayableAmount(req.body.amount, req.body.order_id, req.body.reservation_id);
  if (!amount || amount <= 0) return res.status(400).json({ detail: "No payable amount found" });
  const razorpayOrder = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: "INR", payment_capture: 1, notes: req.body.notes || {} });
  const payment = { razorpay_order_id: razorpayOrder.id, amount, currency: "INR", status: "created", order_id: req.body.order_id || null, reservation_id: req.body.reservation_id || null, notes: req.body.notes || {}, created_at: now() };
  await collections.payments.insertOne(payment);
  res.json({ razorpay_order_id: razorpayOrder.id, razorpay_key: process.env.RAZORPAY_KEY_ID, amount: Math.round(amount * 100), currency: "INR", order_id: req.body.order_id || null, reservation_id: req.body.reservation_id || null });
}));

app.post(`${API_PREFIX}/payment/verify`, authOptional, asyncRoute(async (req, res) => {
  const signatureText = `${req.body.razorpay_order_id}|${req.body.razorpay_payment_id}`;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(signatureText).digest("hex");
  if (!safeCompare(expected, req.body.razorpay_signature)) {
    return res.status(400).json({ detail: "Invalid payment signature" });
  }
  const payment = await collections.payments.findOne({ razorpay_order_id: req.body.razorpay_order_id });
  if (!payment) return res.status(400).json({ detail: "Payment order not found" });
  if (req.body.order_id && payment.order_id !== req.body.order_id) return res.status(400).json({ detail: "Payment does not match order" });
  if (req.body.reservation_id && payment.reservation_id !== req.body.reservation_id) return res.status(400).json({ detail: "Payment does not match reservation" });
  await collections.payments.updateOne({ _id: payment._id }, { $set: { razorpay_payment_id: req.body.razorpay_payment_id, razorpay_signature: req.body.razorpay_signature, status: "paid", verified_at: now() } });
  if (req.body.order_id) {
    const id = objectId(req.body.order_id);
    const order = await collections.orders.findOne({ _id: id });
    await collections.orders.updateOne({ _id: id }, { $set: { payment_status: "paid", payment_id: req.body.razorpay_payment_id, status: "confirmed", updated_at: now() } });
    if (order) await saveCart(order.user_id, []);
  }
  if (req.body.reservation_id) {
    await collections.reservations.updateOne({ _id: objectId(req.body.reservation_id) }, { $set: { payment_status: "paid", payment_id: req.body.razorpay_payment_id, status: "confirmed", updated_at: now() } });
  }
  res.json({ success: true, message: "Payment verified successfully" });
}));

async function resolvePayableAmount(requestedAmount, orderId, reservationId) {
  if (orderId) {
    const order = await collections.orders.findOne({ _id: objectId(orderId) });
    return order ? Number(order.total) : null;
  }
  if (reservationId) {
    const reservation = await collections.reservations.findOne({ _id: objectId(reservationId) });
    return reservation ? Number(reservation.preorder_total || 0) : null;
  }
  return requestedAmount ? Number(requestedAmount) : null;
}

async function paymentWebhook(req, res, next) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body;
    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
      if (!signature || !safeCompare(expected, signature)) {
        return res.status(400).json({ detail: "Invalid webhook signature" });
      }
    }
    const event = JSON.parse(body.toString("utf8"));
    const orderId = event && event.payload && event.payload.payment && event.payload.payment.entity && event.payload.payment.entity.order_id;
    if (orderId && collections) {
      await collections.payments.updateOne({ razorpay_order_id: orderId }, { $set: { last_webhook_event: event.event, last_webhook_at: now(), webhook_payload: event } });
    }
    return res.json({ status: "received" });
  } catch (error) {
    return next(error);
  }
}

app.get(`${API_PREFIX}/user/profile`, authRequired, (req, res) => {
  const user = { ...req.user };
  delete user.password_hash;
  delete user.salt;
  res.json(serialize({ id: user._id, phone: user.phone, name: user.name, email: user.email, dob: user.dob, addresses: user.addresses || [], created_at: user.created_at, is_active: user.is_active !== false }));
});

app.put(`${API_PREFIX}/user/profile`, authRequired, asyncRoute(async (req, res) => {
  const update = {};
  if (req.body.name) update.name = String(req.body.name).trim();
  if (req.body.email) update.email = String(req.body.email).toLowerCase().trim();
  if (req.body.dob) update.dob = req.body.dob;
  update.updated_at = now();
  const result = await collections.users.findOneAndUpdate({ _id: req.user._id }, { $set: update }, { returnDocument: "after" });
  const user = result;
  res.json({ success: true, message: "Profile updated successfully", user: serialize({ id: user._id, phone: user.phone, name: user.name, email: user.email, dob: user.dob, addresses: user.addresses || [], created_at: user.created_at, is_active: user.is_active !== false }) });
}));

app.get(`${API_PREFIX}/user/orders`, authRequired, asyncRoute(async (req, res) => {
  const orders = await collections.orders.find({ user_id: req.user._id }).sort({ created_at: -1 }).toArray();
  res.json({ success: true, orders: serialize(orders), total: orders.length });
}));

app.get(`${API_PREFIX}/user/reservations`, authRequired, asyncRoute(async (req, res) => {
  const reservations = await collections.reservations.find({ user_id: req.user._id }).sort({ created_at: -1 }).toArray();
  res.json({ success: true, reservations: serialize(reservations), total: reservations.length });
}));

app.get(`${API_PREFIX}/admin/dashboard`, adminRequired, asyncRoute(async (_req, res) => {
  const totalUsers = await collections.users.countDocuments({});
  const totalOrders = await collections.orders.countDocuments({});
  const totalReservations = await collections.reservations.countDocuments({});
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayOrders = await collections.orders.countDocuments({ created_at: { $gte: today } });
  const paidOrders = await collections.orders.find({ payment_status: "paid" }).toArray();
  const totalRevenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const recentOrders = await collections.orders.find().sort({ created_at: -1 }).limit(5).toArray();
  res.json({ success: true, stats: { total_users: totalUsers, total_orders: totalOrders, total_reservations: totalReservations, today_orders: todayOrders, total_revenue: totalRevenue, avg_order_value: paidOrders.length ? totalRevenue / paidOrders.length : 0, today_revenue: 0 }, recent_orders: serialize(recentOrders) });
}));

app.get(`${API_PREFIX}/admin/sales-summary`, adminRequired, asyncRoute(async (_req, res) => {
  const rows = await collections.orders.aggregate([{ $match: { payment_status: "paid" } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $limit: 30 }]).toArray();
  const topItems = await collections.orders.aggregate([{ $unwind: "$items" }, { $group: { _id: "$items.name", total_quantity: { $sum: "$items.quantity" }, total_revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } }, { $sort: { total_quantity: -1 } }, { $limit: 5 }]).toArray();
  res.json({ success: true, sales_data: rows, top_items: topItems });
}));

app.get(`${API_PREFIX}/admin/users`, adminRequired, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page || 20)));
  const query = req.query.search ? { $or: [{ phone: { $regex: req.query.search, $options: "i" } }, { name: { $regex: req.query.search, $options: "i" } }, { email: { $regex: req.query.search, $options: "i" } }] } : {};
  const total = await collections.users.countDocuments(query);
  const users = await collections.users.find(query).skip((page - 1) * perPage).limit(perPage).toArray();
  for (const user of users) {
    delete user.password_hash;
    delete user.salt;
    user.order_count = await collections.orders.countDocuments({ user_id: user._id });
  }
  res.json({ success: true, users: serialize(users), total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) });
}));

app.get(`${API_PREFIX}/admin/customer-stats`, adminRequired, asyncRoute(async (_req, res) => {
  const total = await collections.users.countDocuments({});
  const active = await collections.users.countDocuments({ is_active: { $ne: false } });
  const withOrders = (await collections.orders.distinct("user_id")).length;
  res.json({ success: true, stats: { total, active, inactive: total - active, with_orders: withOrders } });
}));

app.patch(`${API_PREFIX}/admin/users/:userId/status`, adminRequired, asyncRoute(async (req, res) => {
  const result = await collections.users.updateOne({ _id: objectId(req.params.userId) }, { $set: { is_active: Boolean(req.body.is_active), updated_at: now() } });
  if (!result.matchedCount) return res.status(404).json({ detail: "User not found" });
  res.json({ success: true, message: "Customer status updated" });
}));

app.get(`${API_PREFIX}/admin/users/:userId/orders`, adminRequired, asyncRoute(async (req, res) => {
  const orders = await collections.orders.find({ user_id: objectId(req.params.userId) }).sort({ created_at: -1 }).toArray();
  res.json({ success: true, orders: serialize(orders), total: orders.length });
}));

app.get(`${API_PREFIX}/admin/users/:userId/reservations`, adminRequired, asyncRoute(async (req, res) => {
  const reservations = await collections.reservations.find({ user_id: objectId(req.params.userId) }).sort({ created_at: -1 }).toArray();
  res.json({ success: true, reservations: serialize(reservations), total: reservations.length });
}));

app.get(`${API_PREFIX}/admin/order-stats`, adminRequired, asyncRoute(async (_req, res) => {
  const rows = await collections.orders.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray();
  res.json({ success: true, stats: Object.fromEntries(rows.map((row) => [row._id, row.count])), total: await collections.orders.countDocuments({}) });
}));

app.get(`${API_PREFIX}/admin/settings`, adminRequired, asyncRoute(async (_req, res) => {
  const doc = await collections.settings.findOne({ _id: "restaurant" });
  res.json({ success: true, settings: serialize(doc || { _id: "restaurant", restaurantName: settings.restaurantName, deliveryFee: settings.deliveryFee, freeDeliveryThreshold: settings.freeDeliveryThreshold, maxGuests: settings.maxGuests }) });
}));

app.put(`${API_PREFIX}/admin/settings`, adminRequired, asyncRoute(async (req, res) => {
  await collections.settings.updateOne({ _id: "restaurant" }, { $set: { ...req.body, updated_at: now() } }, { upsert: true });
  res.json({ success: true, settings: serialize(await collections.settings.findOne({ _id: "restaurant" })) });
}));

for (const key of ["business-hours", "delivery", "notifications"]) {
  app.get(`${API_PREFIX}/admin/settings/${key}`, adminRequired, asyncRoute(async (_req, res) => {
    const doc = await collections.settings.findOne({ _id: key });
    res.json({ success: true, [key.replace("-", "_")]: serialize(doc || { _id: key }) });
  }));
  app.put(`${API_PREFIX}/admin/settings/${key}`, adminRequired, asyncRoute(async (req, res) => {
    await collections.settings.updateOne({ _id: key }, { $set: { ...req.body, updated_at: now() } }, { upsert: true });
    res.json({ success: true, [key.replace("-", "_")]: serialize(await collections.settings.findOne({ _id: key })) });
  }));
}

app.get(`${API_PREFIX}/admin/offers`, adminRequired, asyncRoute(async (_req, res) => {
  const offers = await collections.offers.find().sort({ created_at: -1 }).toArray();
  res.json({ success: true, offers: serialize(offers) });
}));

app.get(`${API_PREFIX}/admin/offers/active`, asyncRoute(async (_req, res) => {
  const offers = await collections.offers.find({ is_active: { $ne: false } }).sort({ created_at: -1 }).toArray();
  res.json({ success: true, offers: serialize(offers) });
}));

app.post(`${API_PREFIX}/admin/offers`, adminRequired, asyncRoute(async (req, res) => {
  const offer = { ...req.body, is_active: req.body.is_active !== false, created_at: now(), updated_at: now() };
  const result = await collections.offers.insertOne(offer);
  offer._id = result.insertedId;
  res.json({ success: true, offer: serialize(offer) });
}));

app.put(`${API_PREFIX}/admin/offers/:offerId`, adminRequired, asyncRoute(async (req, res) => {
  const result = await collections.offers.findOneAndUpdate({ _id: objectId(req.params.offerId) }, { $set: { ...req.body, updated_at: now() } }, { returnDocument: "after" });
  if (!result) return res.status(404).json({ detail: "Offer not found" });
  res.json({ success: true, offer: serialize(result) });
}));

app.patch(`${API_PREFIX}/admin/offers/:offerId/toggle`, adminRequired, asyncRoute(async (req, res) => {
  const offer = await collections.offers.findOne({ _id: objectId(req.params.offerId) });
  if (!offer) return res.status(404).json({ detail: "Offer not found" });
  const result = await collections.offers.findOneAndUpdate({ _id: offer._id }, { $set: { is_active: offer.is_active === false, updated_at: now() } }, { returnDocument: "after" });
  res.json({ success: true, offer: serialize(result) });
}));

app.delete(`${API_PREFIX}/admin/offers/:offerId`, adminRequired, asyncRoute(async (req, res) => {
  const result = await collections.offers.deleteOne({ _id: objectId(req.params.offerId) });
  if (!result.deletedCount) return res.status(404).json({ detail: "Offer not found" });
  res.json({ success: true, message: "Offer deleted" });
}));

app.get(`${API_PREFIX}/admin/reviews`, adminRequired, asyncRoute(async (_req, res) => {
  const reviews = await collections.reviews.find().sort({ created_at: -1 }).toArray();
  res.json({ success: true, reviews: serialize(reviews), total: reviews.length });
}));

app.get(`${API_PREFIX}/admin/reviews/pending`, adminRequired, asyncRoute(async (_req, res) => {
  const reviews = await collections.reviews.find({ approved: { $ne: true } }).sort({ created_at: -1 }).toArray();
  res.json({ success: true, reviews: serialize(reviews), total: reviews.length });
}));

app.get(`${API_PREFIX}/admin/review-stats`, adminRequired, asyncRoute(async (_req, res) => {
  const total = await collections.reviews.countDocuments({});
  const pending = await collections.reviews.countDocuments({ approved: { $ne: true } });
  const approved = await collections.reviews.countDocuments({ approved: true });
  res.json({ success: true, stats: { total, pending, approved } });
}));

app.patch(`${API_PREFIX}/admin/reviews/:reviewId/approve`, adminRequired, asyncRoute(async (req, res) => {
  await collections.reviews.updateOne({ _id: objectId(req.params.reviewId) }, { $set: { approved: true, updated_at: now() } });
  res.json({ success: true, message: "Review approved" });
}));

app.patch(`${API_PREFIX}/admin/reviews/:reviewId/reject`, adminRequired, asyncRoute(async (req, res) => {
  await collections.reviews.updateOne({ _id: objectId(req.params.reviewId) }, { $set: { approved: false, rejected: true, updated_at: now() } });
  res.json({ success: true, message: "Review rejected" });
}));

app.delete(`${API_PREFIX}/admin/reviews/:reviewId`, adminRequired, asyncRoute(async (req, res) => {
  await collections.reviews.deleteOne({ _id: objectId(req.params.reviewId) });
  res.json({ success: true, message: "Review deleted" });
}));

if (staticDir) {
  app.get("*", (req, res, next) => {
    if (req.path.startsWith(API_PREFIX)) return next();
    return res.sendFile(path.join(staticDir, "index.html"));
  });
}

app.use((req, res) => res.status(404).json({ detail: "Not found" }));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ detail: error.message || "Internal server error" });
});

async function start() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(settings.dbName);
  collections = {
    users: db.collection("users"),
    admins: db.collection("admins"),
    menu_items: db.collection("menu_items"),
    carts: db.collection("carts"),
    orders: db.collection("orders"),
    reservations: db.collection("reservations"),
    payments: db.collection("payments"),
    reviews: db.collection("reviews"),
    offers: db.collection("offers"),
    settings: db.collection("settings")
  };
  razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  await ensureIndexes();
  await ensureDefaultAdmin();
  app.listen(PORT, () => console.log(`Cheesy Crust Node API listening on ${PORT}`));
}

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
