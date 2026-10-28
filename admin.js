document.addEventListener("DOMContentLoaded", () => {
  const base = (window.ARP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  const loginPanel = document.getElementById("loginPanel");
  const dashboard = document.getElementById("dashboard");
  const message = document.getElementById("adminMessage");
  const list = document.getElementById("applicationList");
  const loginButton = document.getElementById("loginButton");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const setMessage = (el, text, state = "") => { el.textContent = text; el.dataset.state = state; };
  const api = async (path, options = {}) => {
    const response = await fetch(base + path, { credentials: "include", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  };
  if (!base || base.includes("REPLACE-WITH-YOUR-BACKEND-DOMAIN")) {
    setMessage(message, "Backend URL has not been configured in api-config.js.", "error");
    loginButton.disabled = true;
    return;
  }
  loginButton.addEventListener("click", () => { window.location.href = base + "/auth/discord"; });
  document.getElementById("logoutButton").addEventListener("click", async () => {
    try { await api("/auth/logout", { method: "POST" }); } finally { window.location.reload(); }
  });
  document.getElementById("refreshButton").addEventListener("click", loadApplications);
  document.querySelectorAll(".admin-tab").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((b) => b.classList.toggle("active", b === button));
    document.getElementById("applicationsTab").hidden = button.dataset.tab !== "applications";
    document.getElementById("contentTab").hidden = button.dataset.tab !== "content";
  }));
  async function loadApplications() {
    list.innerHTML = "<p>Loading applications…</p>";
    try {
      const { applications } = await api("/api/admin/applications");
      document.getElementById("pendingCount").textContent = applications.filter(a => a.status === "pending").length;
      if (!applications.length) { list.innerHTML = "<p>No applications have been submitted yet.</p>"; return; }
      list.innerHTML = applications.map(a => `<article class="admin-application"><div class="admin-app-top"><div><p class="eyebrow">APPLICATION #${esc(a.id)}</p><h3>${esc(a.robloxUsername)} <span class="admin-status status-${esc(a.status)}">${esc(a.status)}</span></h3></div><time>${esc(new Date(a.createdAt).toLocaleString())}</time></div><div class="admin-app-details"><p><b>Discord:</b> ${esc(a.discordUsername)} (<code>${esc(a.discordUserId)}</code>)</p><p><b>Age range:</b> ${esc(a.ageRange)} · <b>Timezone:</b> ${esc(a.timezone)} · <b>Availability:</b> ${esc(a.availability)}</p><p><b>Why staff?</b><br>${esc(a.motivation)}</p><p><b>Rule scenario:</b><br>${esc(a.scenario)}</p><p><b>Experience:</b><br>${esc(a.experience || "Not provided")}</p><p><b>Additional information:</b><br>${esc(a.additional || "Not provided")}</p>${a.decisionNote ? `<p><b>Decision note:</b> ${esc(a.decisionNote)}</p>` : ""}</div>${a.status === "pending" ? `<form class="decision-form" data-id="${esc(a.id)}"><label>Optional note to applicant<input name="note" maxlength="500" placeholder="Reason or next steps"></label><div class="decision-actions"><button class="button button-primary" type="button" data-decision="accepted">Accept & DM</button><button class="button button-danger" type="button" data-decision="denied">Deny & DM</button></div></form>` : `<p class="small-note">Reviewed by ${esc(a.reviewedBy || "staff")} · ${esc(a.reviewedAt ? new Date(a.reviewedAt).toLocaleString() : "")}</p>`}</article>`).join("");
      list.querySelectorAll("[data-decision]").forEach(button => button.addEventListener("click", async () => {
        const form = button.closest("form");
        const id = form.dataset.id;
        const status = button.dataset.decision;
        if (!window.confirm(`Are you sure you want to ${status === "accepted" ? "ACCEPT" : "DENY"} this application? The applicant will receive a Discord DM.`)) return;
        form.querySelectorAll("button").forEach(b => b.disabled = true);
        try {
          await api("/api/admin/applications/" + encodeURIComponent(id) + "/decision", { method: "POST", body: JSON.stringify({ status, note: form.elements.note.value }) });
          await loadApplications();
        } catch (error) { alert(error.message); form.querySelectorAll("button").forEach(b => b.disabled = false); }
      }));
    } catch (error) { list.innerHTML = ""; setMessage(message, error.message, "error"); loginPanel.hidden = false; dashboard.hidden = true; }
  }
  const contentForm = document.getElementById("contentForm");
  contentForm.addEventListener("submit", async event => {
    event.preventDefault();
    const msg = document.getElementById("contentMessage");
    const button = contentForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api("/api/admin/content", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(contentForm).entries())) });
      setMessage(msg, "Website content saved.", "success");
    } catch (error) { setMessage(msg, error.message, "error"); }
    finally { button.disabled = false; }
  });
  async function start() {
    try {
      const { user } = await api("/api/admin/me");
      loginPanel.hidden = true;
      dashboard.hidden = false;
      document.getElementById("adminName").textContent = user.username;
      document.getElementById("adminRoleText").textContent = user.roles.join(" · ");
      const { content } = await api("/api/content");
      for (const field of ["homeHeadline", "homeIntro", "announcement"]) contentForm.elements[field].value = content[field] || "";
      await loadApplications();
    } catch { loginPanel.hidden = false; dashboard.hidden = true; }
  }
  start();
});