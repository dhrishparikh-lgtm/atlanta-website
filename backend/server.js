import "dotenv/config";
import express from "express";
import session from "express-session";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const required = ["FRONTEND_URL", "API_PUBLIC_URL", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "SESSION_SECRET"];
for (const key of required) if (!process.env[key]) throw new Error("Missing required environment variable: " + key);
if (process.env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, "");
const apiPublicUrl = process.env.API_PUBLIC_URL.replace(/\/$/, "");
const adminRoleIds = new Set((process.env.ADMIN_ROLE_IDS || "1538727238483050664,1538727238441369677").split(",").map(x => x.trim()).filter(Boolean));
const app = express();
const dataDir = path.dirname(process.env.DATABASE_PATH || "./data/arp.sqlite");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(process.env.DATABASE_PATH || "./data/arp.sqlite");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY, robloxUsername TEXT NOT NULL, discordUsername TEXT NOT NULL,
  discordUserId TEXT NOT NULL, ageRange TEXT NOT NULL, timezone TEXT NOT NULL,
  availability TEXT NOT NULL, motivation TEXT NOT NULL, scenario TEXT NOT NULL,
  experience TEXT NOT NULL DEFAULT '', additional TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', decisionNote TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL, reviewedAt TEXT, reviewedBy TEXT, dmSent INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
`);
const defaults = {
  homeHeadline: "Welcome to Atlanta Roleplay",
  homeIntro: "A community built around organised roleplay, active staff, and a better experience for every member.",
  announcement: ""
};
const insertContent = db.prepare("INSERT OR IGNORE INTO site_content (key, value) VALUES (?, ?)");
for (const [key, value] of Object.entries(defaults)) insertContent.run(key, value);
const getContent = () => Object.fromEntries(db.prepare("SELECT key, value FROM site_content").all().map(row => [row.key, row.value]));
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(cors({ origin: frontendUrl, credentials: true, methods: ["GET", "POST", "PUT", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
app.use(express.json({ limit: "30kb" }));
app.use(session({
  name: "arp_admin_session",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "none", maxAge: 1000 * 60 * 60 * 8 }
}));
app.use("/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use("/api/applications", rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }));

const discordApi = "https://discord.com/api/v10";
async function discord(pathname, options = {}) {
  const response = await fetch(discordApi + pathname, {
    ...options,
    headers: { Authorization: "Bot " + process.env.DISCORD_BOT_TOKEN, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Discord API returned " + response.status + (detail ? ": " + detail.slice(0, 250) : ""));
  }
  if (response.status === 204) return null;
  return response.json();
}
async function getMember(userId) {
  return discord("/guilds/" + process.env.DISCORD_GUILD_ID + "/members/" + encodeURIComponent(userId));
}
function requireAdmin(req, res, next) {
  if (!req.session?.admin) return res.status(401).json({ error: "Sign in with an authorised Discord account." });
  next();
}
function validateString(value, label, max, min = 1) {
  if (typeof value !== "string") return label + " is required.";
  const cleaned = value.trim();
  if (cleaned.length < min) return label + " must be at least " + min + " characters.";
  if (cleaned.length > max) return label + " must be " + max + " characters or fewer.";
  return null;
}
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;
  req.session.save(() => {
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", process.env.DISCORD_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });
});
app.get("/auth/discord/callback", async (req, res) => {
  try {
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) return res.status(400).send("Invalid or expired Discord login state. Return to the admin page and try again.");
    delete req.session.oauthState;
    const tokenResponse = await fetch(discordApi + "/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code: String(req.query.code), redirect_uri: process.env.DISCORD_REDIRECT_URI })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error("Discord OAuth token exchange failed.");
    const userResponse = await fetch(discordApi + "/users/@me", { headers: { Authorization: "Bearer " + tokenData.access_token } });
    const user = await userResponse.json();
    if (!userResponse.ok || !user.id) throw new Error("Could not verify Discord account.");
    const member = await getMember(user.id);
    const roles = (member.roles || []).filter(role => adminRoleIds.has(role));
    if (!roles.length) {
      req.session.destroy(() => {});
      return res.status(403).send("Your Discord account is not authorised to use this dashboard. Ask a Founder to check your server roles.");
    }
    req.session.admin = { id: user.id, username: user.global_name || user.username, avatar: user.avatar || null, roles };
    req.session.save(() => res.redirect(frontendUrl + "/admin.html"));
  } catch (error) {
    console.error("Discord login failed:", error.message);
    res.status(502).send("Discord login could not be completed. Check that the bot is in the server and the OAuth redirect URI matches the configured URI.");
  }
});
app.post("/auth/logout", (req, res) => req.session.destroy(error => {
  if (error) return res.status(500).json({ error: "Could not end the session." });
  res.clearCookie("arp_admin_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "none" });
  res.json({ ok: true });
}));
app.get("/api/content", (_req, res) => res.json({ content: getContent() }));
app.post("/api/applications", (req, res) => {
  const body = req.body || {};
  const checks = [
    validateString(body.robloxUsername, "Roblox username", 32),
    validateString(body.discordUsername, "Discord username", 64),
    validateString(body.discordUserId, "Discord user ID", 20),
    validateString(body.ageRange, "Age range", 20),
    validateString(body.timezone, "Timezone", 80),
    validateString(body.availability, "Availability", 40),
    validateString(body.motivation, "Motivation", 1500, 30),
    validateString(body.scenario, "Scenario response", 1500, 30),
    validateString(body.experience ?? "", "Experience", 1200, 0),
    validateString(body.additional ?? "", "Additional information", 1000, 0)
  ].filter(Boolean);
  if (checks.length) return res.status(400).json({ error: checks[0] });
  const discordUserId = body.discordUserId.trim();
  if (!/^\d{17,20}$/.test(discordUserId)) return res.status(400).json({ error: "Enter a valid numeric Discord user ID." });
  const recent = db.prepare("SELECT COUNT(*) AS count FROM applications WHERE discordUserId = ? AND createdAt > ?").get(discordUserId, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (recent.count >= 2) return res.status(429).json({ error: "Only two applications per Discord account are allowed every 24 hours." });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO applications (id, robloxUsername, discordUsername, discordUserId, ageRange, timezone, availability, motivation, scenario, experience, additional, createdAt)
    VALUES (@id, @robloxUsername, @discordUsername, @discordUserId, @ageRange, @timezone, @availability, @motivation, @scenario, @experience, @additional, @createdAt)`).run({
      id, robloxUsername: body.robloxUsername.trim(), discordUsername: body.discordUsername.trim(), discordUserId,
      ageRange: body.ageRange.trim(), timezone: body.timezone.trim(), availability: body.availability.trim(),
      motivation: body.motivation.trim(), scenario: body.scenario.trim(), experience: (body.experience || "").trim(),
      additional: (body.additional || "").trim(), createdAt: new Date().toISOString()
    });
  res.status(201).json({ ok: true, id });
});
app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ user: { username: req.session.admin.username, roles: req.session.admin.roles } }));
app.get("/api/admin/applications", requireAdmin, (_req, res) => {
  const applications = db.prepare("SELECT * FROM applications ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, createdAt DESC").all();
  res.json({ applications: applications.map(({ dmSent, ...application }) => ({ ...application, dmSent: Boolean(dmSent) })) });
});
app.post("/api/admin/applications/:id/decision", requireAdmin, async (req, res) => {
  const { status, note = "" } = req.body || {};
  if (!["accepted", "denied"].includes(status)) return res.status(400).json({ error: "Decision must be accepted or denied." });
  if (typeof note !== "string" || note.length > 500) return res.status(400).json({ error: "Decision note must be 500 characters or fewer." });
  const application = db.prepare("SELECT * FROM applications WHERE id = ?").get(req.params.id);
  if (!application) return res.status(404).json({ error: "Application not found." });
  if (application.status !== "pending") return res.status(409).json({ error: "This application has already been reviewed." });
  const now = new Date().toISOString();
  db.prepare("UPDATE applications SET status = ?, decisionNote = ?, reviewedAt = ?, reviewedBy = ? WHERE id = ? AND status = 'pending'").run(status, note.trim(), now, req.session.admin.username, application.id);
  let dmSent = false;
  try {
    const dm = await discord("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: application.discordUserId }) });
    const decisionText = status === "accepted"
      ? "Your Atlanta Roleplay staff application has been **accepted**. Please check the server and follow any instructions from the leadership team."
      : "Your Atlanta Roleplay staff application has been **denied** at this time. Thank you for applying; you may reapply if recruitment opens again.";
    const content = "Hello! " + decisionText + (note.trim() ? "\n\n**Note from the team:** " + note.trim() : "") + "\n\nhttps://discord.gg/NE2Emkhc2H";
    await discord("/channels/" + dm.id + "/messages", { method: "POST", body: JSON.stringify({ content }) });
    dmSent = true;
    db.prepare("UPDATE applications SET dmSent = 1 WHERE id = ?").run(application.id);
  } catch (error) {
    console.error("Decision DM failed for application", application.id, error.message);
  }
  res.json({ ok: true, status, dmSent, warning: dmSent ? null : "Decision saved, but Discord DM could not be delivered. Check that the bot can DM the applicant." });
});
app.put("/api/admin/content", requireAdmin, (req, res) => {
  const input = req.body || {};
  const fields = { homeHeadline: 100, homeIntro: 500, announcement: 500 };
  for (const [key, max] of Object.entries(fields)) {
    if (typeof input[key] !== "string" || input[key].length > max) return res.status(400).json({ error: key + " must be text no longer than " + max + " characters." });
  }
  const update = db.prepare("INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const transaction = db.transaction(() => Object.entries(fields).forEach(([key]) => update.run(key, input[key].trim())));
  transaction();
  res.json({ ok: true, content: getContent() });
});
app.use((error, _req, res, _next) => {
  console.error("Unhandled API error:", error.message);
  res.status(500).json({ error: "An internal server error occurred." });
});
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log("Atlanta Roleplay API listening on port " + port));
