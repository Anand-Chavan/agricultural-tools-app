import path from 'node:path';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { doubleCsrf } from 'csrf-csrf';
import { loadUser } from './middleware/auth.js';
import { sendError } from './lib/errors.js';
import { authRouter } from './routes/auth.js';
import { productsRouter, categoriesRouter } from './routes/products.js';
import { inventoryRouter } from './routes/inventory.js';
import { purchasesRouter, suppliersRouter } from './routes/purchases.js';
import { customersRouter } from './routes/customers.js';
import { invoicesRouter } from './routes/invoices.js';
import { dashboardRouter } from './routes/dashboard.js';
import { reportsRouter } from './routes/reports.js';
import { usersRouter, rolesRouter, auditRouter } from './routes/users.js';
import { settingsRouter } from './routes/settings.js';

const PgSession = connectPgSimple(session);

export function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use(
    session({
      name: process.env.SESSION_COOKIE_NAME || 'agri.sid',
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
        tableName: 'session',
      }),
      secret: process.env.SESSION_SECRET || 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.COOKIE_SECURE === 'true' || isProd,
        maxAge: 1000 * 60 * 60 * 12,
      },
    }),
  );

  const { generateToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => process.env.SESSION_SECRET || 'dev-secret',
    getSessionIdentifier: (req) => req.sessionID || 'anon',
    cookieName: process.env.CSRF_COOKIE_NAME || 'agri.csrf',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true' || isProd,
      path: '/',
    },
    getTokenFromRequest: (req) =>
      (req.headers['x-csrf-token'] as string) || (req.body?._csrf as string),
  });

  app.get('/api/csrf', (req, res) => {
    // Ensure session exists before binding CSRF to it
    if (req.session && !(req.session as { csrfReady?: boolean }).csrfReady) {
      (req.session as { csrfReady?: boolean }).csrfReady = true;
    }
    const token = generateToken(req, res, true);
    res.json({ csrfToken: token });
  });

  app.use(loadUser);

  // CSRF for mutating API calls (skip login bootstrap; skip in automated tests)
  app.use('/api', (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.path === '/auth/login') return next();
    return doubleCsrfProtection(req, res, next);
  });

  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
  app.use('/uploads', express.static(uploadRoot));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/purchases', purchasesRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/audit-logs', auditRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendError(res, err);
  });

  return app;
}
