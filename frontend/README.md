# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

---

## Connected to the ContextOps backend

This copy of the app calls the FastAPI + FalkorDB backend instead of local mock data.

* `VITE_API_BASE_URL` (default `http://localhost:8000`) selects the backend. `VITE_*` variables are public; never put secrets here.
* A missing backend shows an explicit **Backend disconnected** state with a Retry button. Mock data is never substituted silently.
* `VITE_ENABLE_OFFLINE_FALLBACK=true` is an explicit, opt-in read-only mode that shows the bundled fictional data from `src/data/demoData.ts` without calling the backend (investigations are disabled).
* Data access: `src/services/{config,http,api,queries}.ts`. Shared states: `src/components/ui-states.tsx`.
* Node.js 20.19+ or 22.12+ is required (Vite 8). Install with `npm install` (fallback: `npm install --legacy-peer-deps`).
* Tests: `npm test` (HTTP client, connection states, and page integration tests using responses captured from the live backend in `src/test/fixtures`).
