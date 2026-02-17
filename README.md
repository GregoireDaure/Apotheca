<p align="center">
  <img src="apps/web/public/favicon.svg" width="80" alt="Apotheca icon" />
</p>

<h1 align="center">Apotheca</h1>

<p align="center">
  <strong>Your digital medicine cabinet</strong><br/>
  A self-hosted PWA for tracking your household medicine inventory — scan barcodes, monitor expiry dates, and never wonder <em>"do I have this?"</em> again.
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white" />
</p>

---

## Why Apotheca?

Managing a home medicine cabinet is an invisible daily friction. You buy duplicates because you forgot what you have. You keep expired medicines unknowingly. And the worst moment to discover you're out of something is when you're sick at 2am.

**Apotheca** solves this with radical simplicity:

- **Scan** a barcode or DataMatrix code on any French medicine box
- **See** your full inventory with quantities and expiry dates
- **Get alerted** before medicines expire or run out
- **Share** one account with your household via biometric login

No clinical complexity, no bloat — just confidence in what's in your cabinet.

## Features

### Core

- **Barcode & DataMatrix scanning** — Camera-based, auto-detects CIP13 barcodes and GS1 DataMatrix codes. Extracts product ID + expiry date automatically.
- **French drug database integration** — Automatic lookup via the [Médicaments FR API](https://medicaments-api.giygas.dev) (BDPM/ANSM data). Gets medicine name, form, strength, composition.
- **Manual entry with search** — Type-ahead search with disambiguation UI. Full manual fallback when no barcode match.
- **Inventory management** — Box-level quantity tracking. Increment on scan, decrement with a tap. Per-box expiry tracking under the hood.
- **Dashboard home screen** — Opens to a status overview: total medicines, items expiring, items to restock. "Action Needed" section surfaces what matters.
- **Expiry & restock alerts** — 30-day warning, expired hard alert, opt-in last-box restock alerts. Push notifications + in-app notification center.
- **Search** — Instant type-ahead search across your inventory.

### Authentication

- **Passwordless** — WebAuthn/Passkeys with biometric login (Face ID, Touch ID, etc.)
- **Shared household** — Single account, multiple registered passkeys — one per person/device
- **Persistent sessions** — Stay logged in with automatic re-authentication

### PWA

- **Installable** — Add to home screen on iOS and Android, works like a native app
- **Offline-capable** — App shell loads from cache, cached data shown when offline
- **Push notifications** — Expiry warnings and restock alerts delivered to your device
- **Mobile-first** — Designed for iPhone viewport, scales to desktop

### Bulk Scanning

- **Rapid-fire mode** — Scan multiple medicines in sequence (pharmacy bag unload)
- **Staging list** — Review all scanned items before confirming
- **Bidirectional** — Scan to add or remove medicines

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query |
| **Backend** | NestJS 11, TypeORM, PostgreSQL 16, Zod |
| **Auth** | WebAuthn / Passkeys via SimpleWebAuthn |
| **Scanning** | html5-qrcode (camera-based barcode/DataMatrix) |
| **PWA** | vite-plugin-pwa, Workbox, Web Push API |
| **Testing** | Vitest (unit), Jest (API), Playwright (E2E) |
| **Infra** | Docker, Traefik (reverse proxy + auto-TLS), nginx (static files) |
| **Monorepo** | pnpm workspaces |

## Project Structure

```
├── apps/
│   ├── api/                # NestJS backend
│   │   └── src/
│   │       ├── auth/       # WebAuthn registration & login
│   │       ├── bdpm/       # French drug database proxy
│   │       ├── inventory/  # Inventory CRUD + dashboard stats
│   │       ├── medicines/  # Medicine entity & service
│   │       └── notifications/  # Push subscriptions & alerts
│   └── web/                # React PWA frontend
│       └── src/
│           ├── components/ # UI components (dashboard, scanner, layout)
│           ├── pages/      # Dashboard, Scan, MedicineDetail, Settings, Login
│           ├── stores/     # Zustand stores (auth, bulk-scan)
│           └── api/        # Axios client
├── packages/
│   └── shared/             # Shared Zod schemas & types
├── deploy/                 # nginx config
├── e2e/                    # Playwright E2E tests
├── docker-compose.yml      # Dev (PostgreSQL)
├── docker-compose.prod.yml # Production (Traefik + app + DB)
└── Dockerfile              # Multi-stage build (frontend + backend)
```

## Getting Started

### Prerequisites

- **Node.js** 20+
- **pnpm** 10+
- **Docker** (for PostgreSQL in development)

### Development Setup

```bash
# 1. Clone the repo
git clone https://github.com/<your-user>/apotheca.git
cd apotheca

# 2. Install dependencies
pnpm install

# 3. Start PostgreSQL
docker compose up -d

# 4. Configure environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your settings

# 5. Start dev servers (API + frontend)
pnpm dev
```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:8009`.

### Useful Commands

```bash
pnpm dev              # Start API + frontend concurrently
pnpm build            # Build all packages
pnpm test             # Run API + frontend unit tests
pnpm test:e2e         # Run Playwright E2E tests
pnpm test:e2e:ui      # Run E2E tests with Playwright UI
```

## Production Deployment

Apotheca is designed to be self-hosted. The production stack uses Docker Compose with Traefik for automatic HTTPS via Let's Encrypt.

```bash
# 1. Copy and configure production env
cp .env.production.example .env.production
# Edit .env.production — set DOMAIN, DB_PASSWORD, JWT_SECRET, VAPID keys

# 2. Generate VAPID keys for push notifications
npx web-push generate-vapid-keys

# 3. Deploy
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### Production Environment Variables

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Your server hostname (e.g., `meds.example.com`) |
| `ACME_EMAIL` | Email for Let's Encrypt SSL certificates |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | PostgreSQL credentials |
| `JWT_SECRET` | Secret for session tokens (`openssl rand -base64 48`) |
| `WEBAUTHN_RP_NAME` | Relying party name (default: `Apotheca`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Keys for push notifications |

## API Reference

The API is documented with Swagger/OpenAPI. When running locally, visit:

- **Scalar API Reference:** `http://localhost:8009/reference`

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/auth/status` | Check auth status |
| `GET` | `/api/v1/inventory` | List all inventory items |
| `GET` | `/api/v1/inventory/dashboard` | Dashboard stats |
| `GET` | `/api/v1/inventory/actions` | Items needing attention |
| `POST` | `/api/v1/inventory` | Add medicine (auto-increment if exists) |
| `POST` | `/api/v1/inventory/bulk-add` | Bulk scan add |
| `GET` | `/api/v1/bdpm/lookup/:code` | Lookup medicine by CIP13/CIS |
| `GET` | `/api/v1/bdpm/search?q=...` | Search medicines by name |

## Data & Privacy

- **Self-hosted** — Your data stays on your own infrastructure
- **No third-party data transmission** — Medicine data is fetched from the public BDPM database and cached locally
- **No passwords** — Authentication is biometric-only via WebAuthn
- **No tracking, no analytics, no telemetry**

## Acknowledgements

- [Base de Données Publique des Médicaments (BDPM)](https://base-donnees-publique.medicaments.gouv.fr/) — French public drug database
- [Médicaments FR API](https://medicaments-api.giygas.dev) — Community API for BDPM data access

## License

This project is for personal use. See the repository for license details.
