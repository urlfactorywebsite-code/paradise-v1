# dpq.zeacrm.com with Nginx Proxy Manager

Prepared for Paradise on VPS `167.86.108.178`. These are VPS instructions; no remote changes have been executed by preparing these files.

## 1. DNS

Set the `dpq` A record in the `zeacrm.com` DNS zone to `167.86.108.178`.
The lookup on 2026-11-09 also returned `62.72.14.24`; remove that address from this hostname if Paradise is hosted only on the VPS. Remove the `dpq` AAAA record unless its IPv6 address belongs to this VPS and serves the same proxy. Change only records for `dpq`.

Before requesting a certificate, confirm public DNS resolves to the intended server and inbound TCP ports 80 and 443 reach Proxy Manager.

## 2. Install Paradise on the VPS

The supplied VPS output confirms Proxy Manager container `nginx-proxy-npm-1` already belongs to `nginx-proxy_default`, ports 80/443 are published and allowed through UFW, and host port 6400 has no TCP listener. No Paradise containers or checkout were found by the supplied checks. The override now uses that existing proxy network.

For a new installation, clone the repository. Stop and inspect if the destination already exists:

```bash
git clone https://github.com/urlfactorywebsite-code/paradise-v1.git /opt/paradise-v1
```

After the clone succeeds:

```bash
cd /opt/paradise-v1
docker run --rm -v "$PWD:/workspace" -w /workspace node:24-alpine node scripts/setup-docker.js
```

The setup script creates a private `.env` with a random database password using Node in Docker. Copy the prepared `compose.npm.yaml` alongside `compose.yaml`; this override has not been pushed to GitHub. Then run:

```bash
docker compose -f compose.yaml -f compose.npm.yaml config --quiet
docker compose -f compose.yaml -f compose.npm.yaml up -d --build
docker compose -f compose.yaml -f compose.npm.yaml ps
```

Wait for the app and database to be healthy, then check:

```bash
curl --fail http://127.0.0.1:6400/api/ready
```

For an existing installation, keep its current directory, `.env`, Compose project and volumes. Create a backup with `docker compose exec -T app npm run backup` before recreating the app. Apply only the domain override with `docker compose -f compose.yaml -f compose.npm.yaml up -d --no-deps app`.

The override configures `APP_ORIGIN=https://dpq.zeacrm.com`, secure session cookies and the `dpq-app` alias on `nginx-proxy_default`. The app retains its backend network, loopback host binding and volumes. PostgreSQL has no published host port, so other projects' PostgreSQL ports do not conflict. Proxy Manager requires no network changes.

Use both Compose files for future updates so the domain settings and network survive recreation:

```bash
docker compose -f compose.yaml -f compose.npm.yaml up -d --build
```

## 3. Add the proxy host

In Nginx Proxy Manager, open **Hosts > Proxy Hosts > Add Proxy Host**:

| Field | Value |
| --- | --- |
| Domain Names | `dpq.zeacrm.com` |
| Scheme | `http` |
| Forward Hostname / IP | `dpq-app` |
| Forward Port | `6400` |
| Access List | Publicly Accessible (Paradise provides its own login) |
| Cache Assets | Off |

In **SSL**, request a new Let's Encrypt certificate, provide your certificate email, accept the terms and enable **Force SSL**. Save the host. Certificate issuance requires working DNS and public access to port 80 for the usual HTTP challenge.

`dpq-app` resolves on the shared Docker network. `127.0.0.1` inside a Dockerized Proxy Manager refers to Proxy Manager itself, so use the app alias for the upstream.

## 4. Verify

```bash
curl --fail https://dpq.zeacrm.com/api/ready
curl -I http://dpq.zeacrm.com
```

Expect a successful JSON readiness response over HTTPS and an HTTP redirect to HTTPS. Open `https://dpq.zeacrm.com`, complete first administrator setup for a fresh installation, then sign in and verify a normal permitted save. Domain-only configuration changes do not require a source rebuild.

References: [Nginx Proxy Manager Docker networking](https://nginxproxymanager.com/advanced-config/), [Docker Compose external networks](https://docs.docker.com/compose/how-tos/networking/).
