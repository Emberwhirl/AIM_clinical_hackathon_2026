# Health Data Access Desk

Build "EHDS Access Desk", a web app for a Health Data Access Body under the European Health Data Space. Applicant view: paste a request JSON or pick one of 10 sample requests, submit, and see the decision (REJECT / APPROVE_STATISTICAL / APPROVE_SPE), the cited articles, the reason, and a results table. Staff view (role switch, no login): list of past requests, cohort size, secure-environment status, and a Download button that shows "Download blocked (403)". Use mock responses for now; later the data will come from a Supabase edge function called "requests". Do not create any database tables or migrations: the database schema is managed in a separate repo.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0e19c4c1-bb55-4100-8430-4f7f4839355a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
