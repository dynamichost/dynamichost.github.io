const FILE_IPS = "data/iplist.json";
const FILE_ENTRIES = "data/iplist_with_port.json";

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ ok: true, service: "github-ip-gateway" }, 200, origin);
      }

      if (url.pathname === "/api/ips" && request.method === "GET") {
        const data = await readFile(env, FILE_IPS);
        return json({ count: data.length, ips: data }, 200, origin);
      }

      if (url.pathname === "/api/ips-with-port" && request.method === "GET") {
        const data = await readFile(env, FILE_ENTRIES);
        return json({ count: data.length, entries: data }, 200, origin);
      }

      if (!authorized(request, env)) {
        return json({ error: "Unauthorized" }, 401, origin);
      }

      if (url.pathname === "/api/ips" && request.method === "POST") {
        const body = await request.json();
        const ip = String(body?.ip || "").trim();

        if (!validIp(ip)) return json({ error: "Invalid IP address" }, 400, origin);

        const ips = await readFile(env, FILE_IPS);
        if (ips.includes(ip)) return json({ error: "IP already exists" }, 409, origin);

        ips.push(ip);
        await writeFile(env, FILE_IPS, ips, `Add IP ${ip}`);
        return json({ message: "IP added", ip }, 201, origin);
      }

      const deleteIp = matchPath(url.pathname, /^\/api\/ips\/(.+)$/);
      if (deleteIp && request.method === "DELETE") {
        const ip = decodeURIComponent(deleteIp[1]);

        if (!validIp(ip)) return json({ error: "Invalid IP address" }, 400, origin);

        const ips = await readFile(env, FILE_IPS);
        const next = ips.filter(x => x !== ip);

        if (next.length === ips.length) {
          return json({ error: "IP not found" }, 404, origin);
        }

        await writeFile(env, FILE_IPS, next, `Remove IP ${ip}`);
        return json({ message: "IP removed", ip }, 200, origin);
      }

      if (url.pathname === "/api/ips-with-port" && request.method === "POST") {
        const body = await request.json();
        const ip = String(body?.ip || "").trim();
        const port = Number(body?.port);

        if (!validIp(ip)) return json({ error: "Invalid IP address" }, 400, origin);
        if (!validPort(port)) return json({ error: "Invalid port" }, 400, origin);

        const entries = await readFile(env, FILE_ENTRIES);
        if (entries.some(x => x.ip === ip && x.port === port)) {
          return json({ error: "IP/port entry already exists" }, 409, origin);
        }

        entries.push({ ip, port });
        await writeFile(env, FILE_ENTRIES, entries, `Add ${ip}:${port}`);
        return json({ message: "Entry added", entry: { ip, port } }, 201, origin);
      }

      const deleteEntry = matchPath(
        url.pathname,
        /^\/api\/ips-with-port\/(.+)\/(\d+)$/
      );

      if (deleteEntry && request.method === "DELETE") {
        const ip = decodeURIComponent(deleteEntry[1]);
        const port = Number(deleteEntry[2]);

        if (!validIp(ip) || !validPort(port)) {
          return json({ error: "Invalid IP or port" }, 400, origin);
        }

        const entries = await readFile(env, FILE_ENTRIES);
        const next = entries.filter(x => !(x.ip === ip && x.port === port));

        if (next.length === entries.length) {
          return json({ error: "Entry not found" }, 404, origin);
        }

        await writeFile(env, FILE_ENTRIES, next, `Remove ${ip}:${port}`);
        return json({ message: "Entry removed", entry: { ip, port } }, 200, origin);
      }

      return json({ error: "Not found" }, 404, origin);
    } catch (err) {
      console.error(err);
      return json({ error: err.message || "Internal server error" }, 500, origin);
    }
  }
};

function authorized(request, env) {
  const supplied = request.headers.get("X-Admin-Key");
  return Boolean(env.ADMIN_KEY && supplied && supplied === env.ADMIN_KEY);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Admin-Key",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

function validIp(ip) {
  // Accept IPv4 and IPv6 without requiring an external dependency.
  if (!ip || ip.length > 45) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split(".").every(x => Number(x) >= 0 && Number(x) <= 255);
  }
  if (!ip.includes(":")) return false;
  return /^[0-9a-fA-F:.]+$/.test(ip) && ip.split(":").length >= 3;
}

function validPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function matchPath(pathname, regex) {
  const match = pathname.match(regex);
  return match || null;
}

async function readFile(env, filePath) {
  const api = githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  const response = await fetch(api, {
    headers: githubHeaders(env),
    cf: { cacheTtl: 0, cacheEverything: false }
  });

  if (!response.ok) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }

  const file = await response.json();
  const decoded = atob(file.content.replace(/\n/g, ""));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded, c => c.charCodeAt(0))));
}

async function writeFile(env, filePath, data, message) {
  const api = githubApi(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`);

  const current = await fetch(
    api + `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
    { headers: githubHeaders(env) }
  );

  if (!current.ok) {
    throw new Error(`GitHub current-file lookup failed: ${current.status}`);
  }

  const file = await current.json();
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2) + "\n");

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  const body = {
    message,
    content: btoa(binary),
    sha: file.sha,
    branch: env.GITHUB_BRANCH
  };

  const response = await fetch(api, {
    method: "PUT",
    headers: {
      ...githubHeaders(env),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub write failed: ${response.status} ${text}`);
  }
}

function githubApi(env, path) {
  return `https://api.github.com${path}`;
}

function githubHeaders(env) {
  return {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-ip-gateway"
  };
}
