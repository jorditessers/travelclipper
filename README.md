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

## Browser demo (no database needed)

When no Supabase project is configured (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` not set),
the app runs as a self-contained demo: a PostgreSQL database (PGlite) runs inside the visitor's browser,
with the same migrations, security rules and demo data as the real platform. Nothing is sent to a server;
every visitor gets their own copy, stored in the browser (IndexedDB).

- Sign-in page: "View demo as Accommodation Partner / Distribution Partner / Platform Admin", or create any test account.
- "Start the demo over" on the sign-in page wipes the browser's demo data.
- Code: `src/integrations/demo-backend/` (PostgREST, Auth and Storage emulation on top of PGlite).

Set the Supabase variables (and run `drizzle/migrations` on that project) to switch to a real database.
