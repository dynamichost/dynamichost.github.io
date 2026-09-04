# IP API Gateway

Simple Node.js/Express API gateway backed by two JSON files.

## Requirements

- Node.js 18+ recommended
- npm

## Install

```bash
cd ip-api-gateway
npm install
```

## Configure API key

The write endpoints require `X-API-Key`.

For a temporary shell session:

```bash
export API_KEY='replace-with-a-long-random-secret'
export PORT=3000
npm start
```

If `API_KEY` is not set, the server uses `change-this-api-key`; change it before exposing the service.

## Web UI

Open:

```text
http://SERVER_IP:3000/
```

Enter the same API key in the web UI.

## Read API

```bash
curl http://127.0.0.1:3000/api/ips
curl http://127.0.0.1:3000/api/ips-with-port
```

## Add IP

```bash
curl -X POST http://127.0.0.1:3000/api/ips \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: replace-with-a-long-random-secret' \
  -d '{"ip":"192.0.2.10"}'
```

## Remove IP

```bash
curl -X DELETE http://127.0.0.1:3000/api/ips/192.0.2.10 \
  -H 'X-API-Key: replace-with-a-long-random-secret'
```

## Add IP + port

```bash
curl -X POST http://127.0.0.1:3000/api/ips-with-port \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: replace-with-a-long-random-secret' \
  -d '{"ip":"192.0.2.10","port":443}'
```

## Remove IP + port

```bash
curl -X DELETE http://127.0.0.1:3000/api/ips-with-port/192.0.2.10/443 \
  -H 'X-API-Key: replace-with-a-long-random-secret'
```

## Notes

- Changes are written atomically to the JSON files.
- Duplicate entries are rejected.
- IP addresses are validated with Node's `net.isIP()`.
- Ports must be integers from 1 to 65535.
- The read endpoints are intentionally public. The write endpoints require the API key.
- For Internet exposure, put this service behind Nginx/HTTPS and use a strong API key.
