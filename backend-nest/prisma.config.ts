import { defineConfig } from "@prisma/config";
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
    schema: "src/database/prisma/schema.prisma",
    migrations: {
        path: "src/database/prisma/migrations",
    },
    // Use DIRECT_URL for CLI (migrate deploy) to avoid advisory lock timeouts with Neon pooler.
    // App runtime uses DATABASE_URL via PrismaService adapter.
    datasource: {
        url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
    },
});
