-- ERP base tables live in `erp` (bot can't see them). The bot only sees views in `reports`,
-- through the NOLOGIN role report_reader. App bookkeeping lives in `app`.
DROP SCHEMA IF EXISTS reports CASCADE;
DROP SCHEMA IF EXISTS erp CASCADE;
CREATE SCHEMA erp;
CREATE SCHEMA reports;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE erp.customers (id int PRIMARY KEY, name text NOT NULL, city text, segment text, created_at date, active boolean);
CREATE TABLE erp.suppliers (id int PRIMARY KEY, name text NOT NULL, country text);
CREATE TABLE erp.products (id int PRIMARY KEY, sku text, name text, category text, unit_price numeric(12,2), unit_cost numeric(12,2), supplier_id int REFERENCES erp.suppliers);
CREATE TABLE erp.inventory (product_id int PRIMARY KEY REFERENCES erp.products, on_hand int, reorder_point int);
CREATE TABLE erp.sales_orders (id int PRIMARY KEY, customer_id int REFERENCES erp.customers, order_date date, status text);
CREATE TABLE erp.sales_order_lines (id int PRIMARY KEY, order_id int REFERENCES erp.sales_orders, product_id int REFERENCES erp.products, qty int, unit_price numeric(12,2));
CREATE TABLE erp.purchase_orders (id int PRIMARY KEY, supplier_id int REFERENCES erp.suppliers, product_id int REFERENCES erp.products, qty int, unit_cost numeric(12,2), order_date date, expected_date date, received_date date);
CREATE TABLE erp.invoices (id int PRIMARY KEY, order_id int REFERENCES erp.sales_orders, customer_id int REFERENCES erp.customers, invoice_date date, due_date date, amount numeric(12,2));
CREATE TABLE erp.payments (id int PRIMARY KEY, invoice_id int REFERENCES erp.invoices, paid_date date, amount numeric(12,2));

CREATE TABLE IF NOT EXISTS app.meta (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), as_of date NOT NULL, data_version int NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS app.report_runs (
  id bigserial PRIMARY KEY,
  user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  question text NOT NULL,
  normalized_question text NOT NULL,
  data_version int,
  sql text,
  row_count int,
  status text NOT NULL,            -- ok | refused | failed | cache_hit
  error text,
  model text,
  latency_ms int,
  prompt_tokens int,
  completion_tokens int,
  answer text,
  chart jsonb,
  default_view text,
  result_snapshot jsonb,
  saved boolean NOT NULL DEFAULT false,
  title text
);
CREATE INDEX IF NOT EXISTS report_runs_cache ON app.report_runs (normalized_question, data_version, created_at DESC);

-- ===== The only surface the bot can query =====
CREATE VIEW reports.v_customers AS
  SELECT id AS customer_id, name AS customer_name, city, segment, created_at, active FROM erp.customers;

CREATE VIEW reports.v_products AS
  SELECT p.id AS product_id, p.sku, p.name AS product_name, p.category, p.unit_price, p.unit_cost,
         s.name AS supplier_name, i.on_hand, i.reorder_point
  FROM erp.products p JOIN erp.suppliers s ON s.id = p.supplier_id JOIN erp.inventory i ON i.product_id = p.id;

CREATE VIEW reports.v_sales AS
  SELECT o.id AS order_id, o.order_date, o.status AS order_status,
         c.id AS customer_id, c.name AS customer_name, c.city AS customer_city, c.segment AS customer_segment,
         p.id AS product_id, p.sku, p.name AS product_name, p.category,
         l.qty, l.unit_price, (l.qty * l.unit_price)::numeric(14,2) AS revenue,
         (l.qty * p.unit_cost)::numeric(14,2) AS cost,
         (l.qty * (l.unit_price - p.unit_cost))::numeric(14,2) AS margin
  FROM erp.sales_order_lines l
  JOIN erp.sales_orders o ON o.id = l.order_id
  JOIN erp.customers c ON c.id = o.customer_id
  JOIN erp.products p ON p.id = l.product_id;

CREATE VIEW reports.v_purchasing AS
  SELECT po.id AS po_id, s.id AS supplier_id, s.name AS supplier_name, s.country AS supplier_country,
         p.id AS product_id, p.name AS product_name, po.qty, po.unit_cost,
         (po.qty * po.unit_cost)::numeric(14,2) AS total_cost,
         po.order_date, po.expected_date, po.received_date,
         (po.received_date - po.expected_date) AS days_late,
         (po.received_date IS NOT NULL AND po.received_date <= po.expected_date) AS on_time
  FROM erp.purchase_orders po JOIN erp.suppliers s ON s.id = po.supplier_id JOIN erp.products p ON p.id = po.product_id;

CREATE VIEW reports.v_receivables AS
  SELECT i.id AS invoice_id, i.order_id, c.id AS customer_id, c.name AS customer_name,
         i.invoice_date, i.due_date, i.amount,
         COALESCE(pay.paid, 0)::numeric(14,2) AS paid_amount,
         (i.amount - COALESCE(pay.paid, 0))::numeric(14,2) AS balance,
         CASE WHEN i.amount - COALESCE(pay.paid, 0) <= 0 THEN 'paid'
              WHEN i.due_date < (SELECT as_of FROM app.meta) THEN 'overdue'
              ELSE 'open' END AS status
  FROM erp.invoices i JOIN erp.customers c ON c.id = i.customer_id
  LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM erp.payments GROUP BY invoice_id) pay ON pay.invoice_id = i.id;

-- ===== Least-privilege reader =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'report_reader') THEN CREATE ROLE report_reader NOLOGIN; END IF;
END $$;
GRANT report_reader TO CURRENT_USER;  -- lets the app connection SET ROLE into it
REVOKE ALL ON SCHEMA erp, app FROM PUBLIC;
GRANT USAGE ON SCHEMA reports TO report_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA reports TO report_reader;
