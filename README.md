# GitHub-Based IP Gateway

A GitHub Pages frontend backed by a Cloudflare Worker. The Worker keeps the GitHub token secret and uses the GitHub Contents API to read/write:

- `data/iplist.json`
- `data/iplist_with_port.json`

## Architecture

Browser -> GitHub Pages -> Cloudflare Worker -> GitHub API -> JSON files in repository

The browser never receives the GitHub token.

## 1. Create the repository

Create a GitHub repository and put this project in it.

The Pages site uses the `/docs` directory.

Create these repository files:

```text
data/iplist.json
data/iplist_with_port.json
```

Example `data/iplist.json`:

```json
[
  "192.0.2.10"
]
```

Example `data/iplist_with_port.json`:

```json
[
  {
    "ip": "192.0.2.10",
    "port": 443
  }
]
```

## 2. GitHub Pages

In GitHub:

Settings -> Pages -> Deploy from a branch

Select your default branch and `/docs`.

The frontend is then available at:

```text
https://USERNAME.github.io/REPOSITORY/
```

## 3. GitHub token

Create a fine-grained GitHub token for the repository.

The token should have the minimum repository permission needed to update repository contents.

Do NOT put this token in `docs/app.js`, HTML, or any browser-side JavaScript.

## 4. Cloudflare Worker

The Worker in `worker/worker.js` expects:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `GITHUB_TOKEN`
- `ADMIN_KEY`

Set them as Worker environment variables/secrets.

Example with Wrangler:

```bash
cd worker
npm install
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_KEY
```

Put repository owner/name/branch in `wrangler.toml`.

Then deploy:

```bash
npx wrangler deploy
```

## 5. Connect Pages to the Worker

Edit:

```text
docs/config.js
```

and set:

```js
window.API_BASE = "https://YOUR-WORKER.workers.dev";
```

Commit and push.

## API

### Public reads

```text
GET /api/ips
GET /api/ips-with-port
GET /api/health
```

### Protected writes

Send:

```text
X-Admin-Key: YOUR_ADMIN_KEY
```

Endpoints:

```text
POST   /api/ips
DELETE /api/ips/:ip

POST   /api/ips-with-port
DELETE /api/ips-with-port/:ip/:port
```

## Important behavior

Writes create a Git commit in the GitHub repository. Therefore this is not a low-latency database. It is suitable for a relatively small list where changes are occasional.

For high-frequency updates, use a database such as Cloudflare D1 instead.

## CORS

The Worker allows browser requests from the configured Pages origin. Update `ALLOWED_ORIGIN` in `wrangler.toml` to your actual GitHub Pages URL.

For a custom domain, update it accordingly.

## Security

- Never expose `GITHUB_TOKEN` to the browser.
- Use a strong random `ADMIN_KEY`.
- Keep the repository private if the IP lists should not be public.
- If the repository is public, the JSON files and their Git history are public.
- GitHub commits remain in repository history, so deleting an entry from the JSON file does not erase it from Git history.
