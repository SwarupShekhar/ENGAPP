import { defineConfig } from "@prisma/config";
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
    schema: "src/database/prisma/schema.prisma",
    migrations: {
        path: "src/database/prisma/migrations",
    },
    datasource: {
        url: process.env["DATABASE_URL"],
    },
});
