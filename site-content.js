document.addEventListener("DOMContentLoaded", async () => {
  const base = (window.ARP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  if (!base || base.includes("REPLACE-WITH-YOUR-BACKEND-DOMAIN")) return;
  try {
    const response = await fetch(base + "/api/content");
    if (!response.ok) return;
    const { content } = await response.json();
    document.querySelectorAll("[data-site-content]").forEach(element => {
      const value = content[element.dataset.siteContent];
      if (typeof value === "string" && value.trim()) element.textContent = value;
    });
    if (content.announcement) {
      const banner = document.querySelector("[data-site-announcement]");
      if (banner) { banner.hidden = false; banner.textContent = content.announcement; }
    }
  } catch {}
});