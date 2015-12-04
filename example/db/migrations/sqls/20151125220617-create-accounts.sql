BEGIN;

CREATE TYPE account_status AS ENUM ('active', 'suspended', 'deleted');

CREATE TABLE "accounts" (
  "id"            serial            PRIMARY KEY,
  "requisite"     varchar(32)       NOT NULL,
  "full_name"     varchar(255)      NOT NULL,
  "status"        account_status    NOT NULL          DEFAULT 'active',
  "balance"       numeric(12,2)     DEFAULT 0.00      CHECK ("balance" >= 0.00),
  "created_at"    timestamp         DEFAULT NOW()
);

CREATE UNIQUE INDEX "accounts_requisite_idx" ON "accounts" ("requisite");

COMMIT;
