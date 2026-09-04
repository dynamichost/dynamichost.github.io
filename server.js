const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const net = require("net");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || "change-this-api-key";

const ROOT = __dirname;
const IP_FILE = path.join(ROOT, "iplist.json");
const IP_PORT_FILE = path.join(ROOT, "iplist_with_port.json");

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(ROOT, "public")));

let writeQueue = Promise.resolve();

function queueWrite(task) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => {});
  return next;
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      await atomicWrite(file, fallback);
      return fallback;
    }
    throw err;
  }
}

async function atomicWrite(file, data) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}

function validIp(ip) {
  return typeof ip === "string" && net.isIP(ip.trim()) !== 0;
}

function normalizeIp(ip) {
  return String(ip).trim();
}

function validPort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function requireApiKey(req, res, next) {
  const supplied = req.get("X-API-Key") || req.query.api_key;
  if (supplied !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ip-api-gateway" });
});

app.get("/api/ips", async (req, res) => {
  try {
    const ips = await readJson(IP_FILE, []);
    res.json({ count: ips.length, ips });
  } catch {
    res.status(500).json({ error: "Unable to read iplist.json" });
  }
});

app.get("/api/ips-with-port", async (req, res) => {
  try {
    const entries = await readJson(IP_PORT_FILE, []);
    res.json({ count: entries.length, entries });
  } catch {
    res.status(500).json({ error: "Unable to read iplist_with_port.json" });
  }
});

app.post("/api/ips", requireApiKey, async (req, res) => {
  const ip = normalizeIp(req.body?.ip || "");

  if (!validIp(ip)) {
    return res.status(400).json({ error: "Invalid IP address" });
  }

  try {
    const result = await queueWrite(async () => {
      const ips = await readJson(IP_FILE, []);

      if (ips.includes(ip)) {
        return { duplicate: true, ips };
      }

      ips.push(ip);
      await atomicWrite(IP_FILE, ips);
      return { duplicate: false, ips };
    });

    if (result.duplicate) {
      return res.status(409).json({ error: "IP already exists" });
    }

    res.status(201).json({ message: "IP added", ip });
  } catch {
    res.status(500).json({ error: "Unable to update iplist.json" });
  }
});

app.delete("/api/ips/:ip", requireApiKey, async (req, res) => {
  const ip = normalizeIp(req.params.ip);

  if (!validIp(ip)) {
    return res.status(400).json({ error: "Invalid IP address" });
  }

  try {
    const result = await queueWrite(async () => {
      const ips = await readJson(IP_FILE, []);
      const next = ips.filter((entry) => entry !== ip);

      if (next.length === ips.length) {
        return { found: false };
      }

      await atomicWrite(IP_FILE, next);
      return { found: true };
    });

    if (!result.found) {
      return res.status(404).json({ error: "IP not found" });
    }

    res.json({ message: "IP removed", ip });
  } catch {
    res.status(500).json({ error: "Unable to update iplist.json" });
  }
});

app.post("/api/ips-with-port", requireApiKey, async (req, res) => {
  const ip = normalizeIp(req.body?.ip || "");
  const port = Number(req.body?.port);

  if (!validIp(ip)) {
    return res.status(400).json({ error: "Invalid IP address" });
  }

  if (!validPort(port)) {
    return res.status(400).json({ error: "Port must be an integer from 1 to 65535" });
  }

  try {
    const result = await queueWrite(async () => {
      const entries = await readJson(IP_PORT_FILE, []);
      const exists = entries.some((entry) => entry.ip === ip && entry.port === port);

      if (exists) {
        return { duplicate: true };
      }

      entries.push({ ip, port });
      await atomicWrite(IP_PORT_FILE, entries);
      return { duplicate: false };
    });

    if (result.duplicate) {
      return res.status(409).json({ error: "IP/port entry already exists" });
    }

    res.status(201).json({
      message: "IP/port entry added",
      entry: { ip, port }
    });
  } catch {
    res.status(500).json({ error: "Unable to update iplist_with_port.json" });
  }
});

app.delete("/api/ips-with-port/:ip/:port", requireApiKey, async (req, res) => {
  const ip = normalizeIp(req.params.ip);
  const port = Number(req.params.port);

  if (!validIp(ip) || !validPort(port)) {
    return res.status(400).json({ error: "Invalid IP or port" });
  }

  try {
    const result = await queueWrite(async () => {
      const entries = await readJson(IP_PORT_FILE, []);
      const next = entries.filter(
        (entry) => !(entry.ip === ip && entry.port === port)
      );

      if (next.length === entries.length) {
        return { found: false };
      }

      await atomicWrite(IP_PORT_FILE, next);
      return { found: true };
    });

    if (!result.found) {
      return res.status(404).json({ error: "IP/port entry not found" });
    }

    res.json({
      message: "IP/port entry removed",
      entry: { ip, port }
    });
  } catch {
    res.status(500).json({ error: "Unable to update iplist_with_port.json" });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`IP API Gateway listening on http://0.0.0.0:${PORT}`);
});
