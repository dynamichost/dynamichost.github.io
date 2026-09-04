const API_BASE = (window.API_BASE || "").replace(/\/$/, "");
const keyField = document.querySelector("#adminKey");

keyField.value = sessionStorage.getItem("adminKey") || "";

function saveKey() {
  sessionStorage.setItem("adminKey", keyField.value);
  status("Admin key saved for this tab.", true);
}

function status(message, ok = true) {
  const el = document.querySelector("#status");
  el.textContent = message;
  el.className = ok ? "ok" : "error";
}

function headers(write = false) {
  const h = { "Content-Type": "application/json" };
  if (write) h["X-Admin-Key"] = keyField.value;
  return h;
}

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  }[c]));
}

async function load() {
  try {
    const [ips, entries] = await Promise.all([
      api("/api/ips"),
      api("/api/ips-with-port")
    ]);

    document.querySelector("#ipRows").innerHTML = ips.ips.map(ip => `
      <tr>
        <td><code>${esc(ip)}</code></td>
        <td><button class="danger" onclick="removeIp('${encodeURIComponent(ip)}')">Remove</button></td>
      </tr>
    `).join("");

    document.querySelector("#entryRows").innerHTML = entries.entries.map(e => `
      <tr>
        <td><code>${esc(e.ip)}</code></td>
        <td>${e.port}</td>
        <td><button class="danger" onclick="removeEntry('${encodeURIComponent(e.ip)}',${e.port})">Remove</button></td>
      </tr>
    `).join("");

    status(`Loaded ${ips.count} IPs and ${entries.count} IP/port entries.`);
  } catch (e) {
    status(e.message, false);
  }
}

document.querySelector("#ipForm").addEventListener("submit", async e => {
  e.preventDefault();
  const ip = document.querySelector("#ip").value.trim();

  try {
    await api("/api/ips", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ ip })
    });
    document.querySelector("#ip").value = "";
    await load();
    status(`Added ${ip}.`);
  } catch (e) {
    status(e.message, false);
  }
});

document.querySelector("#entryForm").addEventListener("submit", async e => {
  e.preventDefault();
  const ip = document.querySelector("#entryIp").value.trim();
  const port = Number(document.querySelector("#port").value);

  try {
    await api("/api/ips-with-port", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ ip, port })
    });
    document.querySelector("#entryIp").value = "";
    document.querySelector("#port").value = "";
    await load();
    status(`Added ${ip}:${port}.`);
  } catch (e) {
    status(e.message, false);
  }
});

async function removeIp(encodedIp) {
  const ip = decodeURIComponent(encodedIp);
  if (!confirm(`Remove ${ip}?`)) return;

  try {
    await api(`/api/ips/${encodedIp}`, {
      method: "DELETE",
      headers: headers(true)
    });
    await load();
    status(`Removed ${ip}.`);
  } catch (e) {
    status(e.message, false);
  }
}

async function removeEntry(encodedIp, port) {
  const ip = decodeURIComponent(encodedIp);
  if (!confirm(`Remove ${ip}:${port}?`)) return;

  try {
    await api(`/api/ips-with-port/${encodedIp}/${port}`, {
      method: "DELETE",
      headers: headers(true)
    });
    await load();
    status(`Removed ${ip}:${port}.`);
  } catch (e) {
    status(e.message, false);
  }
}

load();
