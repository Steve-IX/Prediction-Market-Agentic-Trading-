CREATE TABLE IF NOT EXISTS "account_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"available_balance" numeric(18, 2) NOT NULL,
	"locked_balance" numeric(18, 2) NOT NULL,
	"total_balance" numeric(18, 2) NOT NULL,
	"position_value" numeric(18, 2),
	"total_equity" numeric(18, 2),
	"unrealized_pnl" numeric(18, 2),
	"realized_pnl" numeric(18, 2),
	"total_exposure" numeric(18, 2),
	"open_positions_count" integer DEFAULT 0,
	"open_orders_count" integer DEFAULT 0,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "arbitrage_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"market_pair_id" text,
	"markets" jsonb NOT NULL,
	"legs" jsonb NOT NULL,
	"spread_percent" numeric(10, 4) NOT NULL,
	"expected_profit" numeric(18, 2) NOT NULL,
	"expected_profit_bps" numeric(10, 2) NOT NULL,
	"max_size" numeric(18, 2) NOT NULL,
	"was_executed" integer DEFAULT 0,
	"execution_result" jsonb,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_pnl" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"platform" text NOT NULL,
	"strategy_id" text,
	"realized_pnl" numeric(18, 2) DEFAULT '0' NOT NULL,
	"unrealized_pnl" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_pnl" numeric(18, 2) DEFAULT '0' NOT NULL,
	"fees" numeric(18, 6) DEFAULT '0',
	"trades_count" integer DEFAULT 0,
	"win_count" integer DEFAULT 0,
	"loss_count" integer DEFAULT 0,
	"win_rate" numeric(5, 4),
	"avg_win_size" numeric(18, 2),
	"avg_loss_size" numeric(18, 2),
	"volume" numeric(18, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_pairs" (
	"id" text PRIMARY KEY NOT NULL,
	"polymarket_id" text NOT NULL,
	"kalshi_id" text NOT NULL,
	"polymarket_title" text NOT NULL,
	"kalshi_title" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"outcome_mapping" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"verified_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"status" text DEFAULT 'active' NOT NULL,
	"end_date" timestamp,
	"outcome" text,
	"is_active" boolean DEFAULT true,
	"volume_24h" numeric(18, 2),
	"liquidity" numeric(18, 2),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"external_order_id" text,
	"market_id" text NOT NULL,
	"outcome_id" text NOT NULL,
	"side" text NOT NULL,
	"type" text NOT NULL,
	"price" numeric(10, 6) NOT NULL,
	"size" numeric(18, 2) NOT NULL,
	"filled_size" numeric(18, 2) DEFAULT '0',
	"avg_fill_price" numeric(10, 6),
	"status" text DEFAULT 'pending' NOT NULL,
	"strategy_id" text,
	"expires_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"probability" numeric(10, 6),
	"best_bid" numeric(10, 6),
	"best_ask" numeric(10, 6),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"market_id" text NOT NULL,
	"outcome_id" text NOT NULL,
	"outcome_name" text NOT NULL,
	"side" text NOT NULL,
	"size" numeric(18, 6) NOT NULL,
	"avg_entry_price" numeric(10, 6) NOT NULL,
	"current_price" numeric(10, 6),
	"unrealized_pnl" numeric(18, 2) DEFAULT '0',
	"realized_pnl" numeric(18, 2) DEFAULT '0',
	"is_open" integer DEFAULT 1,
	"opened_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_history" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"outcome_id" text NOT NULL,
	"platform" text NOT NULL,
	"best_bid" numeric(10, 6),
	"best_ask" numeric(10, 6),
	"mid_price" numeric(10, 6),
	"spread" numeric(10, 6),
	"bid_size" numeric(18, 2),
	"ask_size" numeric(18, 2),
	"volume" numeric(18, 2),
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_performance" (
	"id" text PRIMARY KEY NOT NULL,
	"strategy_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"trades_count" integer DEFAULT 0,
	"win_count" integer DEFAULT 0,
	"loss_count" integer DEFAULT 0,
	"gross_pnl" numeric(18, 2) DEFAULT '0',
	"fees" numeric(18, 6) DEFAULT '0',
	"net_pnl" numeric(18, 2) DEFAULT '0',
	"max_drawdown" numeric(18, 2),
	"max_drawdown_percent" numeric(5, 4),
	"sharpe_ratio" numeric(10, 4),
	"win_rate" numeric(5, 4),
	"profit_factor" numeric(10, 4),
	"volume" numeric(18, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"platform" text NOT NULL,
	"external_trade_id" text,
	"market_id" text NOT NULL,
	"outcome_id" text NOT NULL,
	"side" text NOT NULL,
	"price" numeric(10, 6) NOT NULL,
	"size" numeric(18, 2) NOT NULL,
	"fee" numeric(18, 6) DEFAULT '0',
	"realized_pnl" numeric(18, 2),
	"strategy_id" text,
	"executed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_pairs" ADD CONSTRAINT "market_pairs_polymarket_id_markets_id_fk" FOREIGN KEY ("polymarket_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_pairs" ADD CONSTRAINT "market_pairs_kalshi_id_markets_id_fk" FOREIGN KEY ("kalshi_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_history" ADD CONSTRAINT "price_history_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trades" ADD CONSTRAINT "trades_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "snapshots_platform_idx" ON "account_snapshots" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "snapshots_timestamp_idx" ON "account_snapshots" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "snapshots_platform_timestamp_idx" ON "account_snapshots" USING btree ("platform","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arb_type_idx" ON "arbitrage_opportunities" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arb_market_pair_idx" ON "arbitrage_opportunities" USING btree ("market_pair_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arb_detected_at_idx" ON "arbitrage_opportunities" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arb_executed_idx" ON "arbitrage_opportunities" USING btree ("was_executed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_pnl_date_idx" ON "daily_pnl" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_pnl_platform_idx" ON "daily_pnl" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_pnl_strategy_idx" ON "daily_pnl" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_pnl_date_platform_idx" ON "daily_pnl" USING btree ("date","platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pairs_polymarket_idx" ON "market_pairs" USING btree ("polymarket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pairs_kalshi_idx" ON "market_pairs" USING btree ("kalshi_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pairs_active_idx" ON "market_pairs" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pairs_unique_idx" ON "market_pairs" USING btree ("polymarket_id","kalshi_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_platform_idx" ON "markets" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_status_idx" ON "markets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_active_idx" ON "markets" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_category_idx" ON "markets" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_end_date_idx" ON "markets" USING btree ("end_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "markets_platform_external_idx" ON "markets" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_platform_idx" ON "orders" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_market_idx" ON "orders" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_strategy_idx" ON "orders" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_external_order_idx" ON "orders" USING btree ("external_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcomes_market_idx" ON "outcomes" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcomes_type_idx" ON "outcomes" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_platform_idx" ON "positions" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_market_idx" ON "positions" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_open_idx" ON "positions" USING btree ("is_open");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_side_idx" ON "positions" USING btree ("side");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_history_timestamp_idx" ON "price_history" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_history_market_timestamp_idx" ON "price_history" USING btree ("market_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_history_platform_idx" ON "price_history" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "perf_strategy_idx" ON "strategy_performance" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "perf_date_idx" ON "strategy_performance" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "perf_strategy_date_idx" ON "strategy_performance" USING btree ("strategy_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_order_idx" ON "trades" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_platform_idx" ON "trades" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_market_idx" ON "trades" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_strategy_idx" ON "trades" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_executed_at_idx" ON "trades" USING btree ("executed_at");