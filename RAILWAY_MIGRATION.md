# Railway Migration

This repo is an isolated monorepo:

- Backend service root directory: `/backend`
- Frontend service root directory: `/frontend`
- Database service: Railway MySQL

## Backend

1. Create a new Railway project.
2. Add a MySQL database service.
3. Add a backend service from this GitHub repo.
4. Set the backend service root directory to `/backend`.
5. If Railway does not auto-detect it, set the config file path to `/backend/railway.json`.
6. In the backend service variables, add:

```env
MYSQL_URL=${{MySQL.MYSQL_URL}}
CHAT_ENCRYPTION_KEY=replace_with_a_long_random_secret
DB_CONNECTION_LIMIT=5
```

Use the exact MySQL service name Railway shows in your canvas. If it is named `mysql` instead of `MySQL`, the reference becomes `${{mysql.MYSQL_URL}}`.

## Uploads

The app stores uploaded assignments, profile images, lessons, and book covers on disk. Attach a Railway volume to the backend service and mount it at:

```txt
/app/uploads
```

Then set:

```env
UPLOAD_ROOT=/app/uploads
```

Without a volume, uploads can disappear when Railway replaces the container.

## Database Import From Clever Cloud

Export the current Clever Cloud database:

```bash
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF -h CLEVER_HOST -P CLEVER_PORT -u CLEVER_USER -p CLEVER_DATABASE > jen_academia.sql
```

Import it into Railway MySQL:

```bash
mysql -h "$MYSQLHOST" -P "$MYSQLPORT" -u "$MYSQLUSER" -p"$MYSQLPASSWORD" "$MYSQLDATABASE" < jen_academia.sql
```

You can get these values from the Railway MySQL service Variables tab, or run the command inside a linked Railway shell so the variables are already available.

## Frontend

If you also move the frontend to Railway:

1. Add a frontend service from the same GitHub repo.
2. Set the root directory to `/frontend`.
3. Generate a public domain for the backend service.
4. Set this frontend variable:

```env
VITE_API_URL=https://your-backend-domain.up.railway.app
```

Then redeploy the frontend.

## Render Cutover

After Railway deploys successfully:

1. Open `https://your-backend-domain.up.railway.app/healthz`.
2. Confirm login and file upload work from the frontend.
3. Update any frontend, DNS, or environment variables that still point to Render.
4. Keep Render and Clever Cloud running until you verify the Railway database has the expected data.
