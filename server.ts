// Custom Next.js server with Socket.io integration.
// Run with: npx tsx server.ts (development) or node dist/server.js (production)

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { registerSessionHandlers } from "./src/lib/session/socket/handler";
import { setIO } from "./src/lib/realtime/io-singleton";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      credentials: true,
    },
    path: "/api/socket",
  });

  setIO(io);
  registerSessionHandlers(io);

  httpServer.listen(port, () => {
    process.stderr.write(
      JSON.stringify({ level: "info", msg: "server ready", port, env: dev ? "dev" : "prod", timestamp: new Date().toISOString() }) + "\n"
    );
  });

  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(
      JSON.stringify({ level: "info", msg: "graceful shutdown", signal, timestamp: new Date().toISOString() }) + "\n"
    );

    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();

    try {
      // 1. Stop accepting new HTTP connections; wait for in-flight requests to finish.
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    } catch { /* already closed */ }

    try {
      // 2. Close Socket.IO and disconnect all clients.
      await new Promise<void>((resolve) => io.close(() => resolve()));
    } catch { /* already closed */ }

    try {
      // 3. Drain the Prisma / pg connection pool.
      const { prisma } = await import("./src/lib/prisma");
      await prisma.$disconnect();
    } catch { /* best-effort */ }

    clearTimeout(forceExit);
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT",  () => void shutdown("SIGINT"));
}).catch((err: unknown) => {
  process.stderr.write(
    JSON.stringify({ level: "error", msg: "server startup failed", err: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }) + "\n"
  );
  process.exit(1);
});
