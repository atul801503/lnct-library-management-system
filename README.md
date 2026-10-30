# LNCT Library Management System

Stack: HTML, CSS, vanilla JavaScript, Node.js, Express, MongoDB, Mongoose.

## Run locally
1. Install Node.js LTS.
2. Open this folder in VS Code.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `MONGODB_URI` to a real local MongoDB or Atlas connection string.
6. Set a private `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
7. Run `npm run dev`.
8. Open http://localhost:3000.

For local MongoDB, ensure its Windows service is running. For Atlas, add your current IP in Network Access and use the database user credentials. Never upload `.env` to GitHub.
