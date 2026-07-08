# OneSpace-UI - Frontend Development Guide

This is the developer guide for the **OneSpace-UI** frontend application. The application is built using Angular 19+ with SSR (Server-Side Rendering) capabilities.

---

## 🛠️ 1. Local Development Setup

To maintain fast feedback loops, run the dev server locally with hot-reloading instead of building Docker images.

### Prerequisites

- **Node.js**: v20 or v24 (LTS recommended)
- **npm**: v10+

### Launching the Frontend

1. Open a terminal in this directory (`OneSpace-UI`).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access the application in your browser at:
   - **Local URL**: `http://localhost:4200`

---

## 🔗 2. API Connection & Environment Separation

The frontend is configured to communicate with the backend API service.

### How the API URL is Resolved

We use a **dynamic hostname resolution** strategy inside `src/app/app.ts`. You do not need to configure any environment files for API connection:

- **In Development (`localhost` or `127.0.0.1`):** The app automatically directs API requests to the local backend at `http://localhost:5000/api`.
- **In Production (Render):** The app automatically resolves the API address to `https://<backend-service-subdomain>/api` (by substituting `-ui` with `-services` in the current hostname).

---

## 🐳 3. Dockerization

To compile the production build inside a container, use the provided `Dockerfile`.

### Build the Docker Image

```bash
docker build -t ghcr.io/naveenyadav9515/pdash-ui:latest .
```

### Push the Image to GitHub Container Registry (GHCR)

```bash
docker push ghcr.io/naveenyadav9515/pdash-ui:latest
```

---

## 🚀 4. Deployment on Render

When setting up your Web Service on Render:

1. **Source Image**: `ghcr.io/naveenyadav9515/pdash-ui:latest`
2. **Environment Variables**: None required.
3. **Health Check Path**: `/`
