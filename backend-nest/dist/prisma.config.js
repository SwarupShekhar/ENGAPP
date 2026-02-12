"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@prisma/config");
const dotenv = require("dotenv");
dotenv.config();
exports.default = (0, config_1.defineConfig)({
    schema: "src/database/prisma/schema.prisma",
    migrations: {
        path: "src/database/prisma/migrations",
    },
    datasource: {
        url: process.env["DATABASE_URL"],
    },
});
//# sourceMappingURL=prisma.config.js.map