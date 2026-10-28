document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("applicationForm");
  const message = document.getElementById("applicationMessage");
  const submit = document.getElementById("applicationSubmit");
  if (!form || !message || !submit) return;

  const apiBase = (window.ARP_CONFIG?.API_BASE_URL || "https://atlanta-website-y293.onrender.com").trim().replace(/\/$/, "");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!apiBase || !/^https:\/\//i.test(apiBase) || apiBase.includes("REPLACE-WITH-YOUR-BACKEND-DOMAIN")) {
      message.textContent = "The application system is not connected yet. The website administrator must configure the backend URL.";
      message.dataset.state = "error";
      return;
    }
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    delete values.confirm;
    submit.disabled = true;
    submit.textContent = "Submitting…";
    message.textContent = "";
    try {
      const response = await fetch(apiBase + "/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not submit your application.");
      form.reset();
      message.textContent = "Application submitted successfully. Keep an eye on your Discord DMs for the team's decision.";
      message.dataset.state = "success";
    } catch (error) {
      message.textContent = error.message || "A network error occurred. Please try again later.";
      message.dataset.state = "error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Submit application";
    }
  });
});