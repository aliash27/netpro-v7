-- ============================================================
-- NetPro — Supabase Schema + Row Level Security (RLS)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. COMPANIES
CREATE TABLE IF NOT EXISTS companies (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'شركتي',
  phone        text,
  email        text,
  plan         text DEFAULT 'trial',
  trial_end    timestamptz DEFAULT (now() + interval '7 days'),
  is_admin     boolean DEFAULT false,
  whatsapp_template text,
  created_at   timestamptz DEFAULT now()
);

-- Auto-create company on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only create company for real owners (not sub-accountants)
  IF NEW.raw_user_meta_data->>'is_sub_accountant' IS NULL THEN
    INSERT INTO companies (owner_id, name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'company_name','شركتي'), NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. SUB_ACCOUNTANTS
CREATE TABLE IF NOT EXISTS sub_accountants (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by   uuid REFERENCES auth.users(id),
  name         text NOT NULL,
  email        text NOT NULL,
  phone        text,
  role         text DEFAULT 'accountant' CHECK (role IN ('accountant','viewer')),
  is_active    boolean DEFAULT true,
  invited_at   timestamptz DEFAULT now()
);

-- 3. SUBSCRIBERS
CREATE TABLE IF NOT EXISTS subscribers (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  phone           text,
  start_date      date,
  monthly_fee     numeric(10,2) DEFAULT 0,
  last_paid_month text,
  notes           text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- 4. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
  subscriber_id   uuid REFERENCES subscribers(id) ON DELETE CASCADE,
  subscriber_name text,
  month           text NOT NULL,
  amount          numeric(10,2) DEFAULT 0,
  paid_at         date DEFAULT CURRENT_DATE,
  notes           text,
  recorded_by     text DEFAULT 'admin',
  created_at      timestamptz DEFAULT now(),
  -- Prevent duplicate payment for same subscriber+month
  UNIQUE (subscriber_id, month)
);

-- 5. SHEETS_CONFIG
CREATE TABLE IF NOT EXISTS sheets_config (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  web_app_url  text,
  sheet_name   text DEFAULT 'المشتركين',
  is_connected boolean DEFAULT false,
  last_sync    timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_accountants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheets_config    ENABLE ROW LEVEL SECURITY;

-- Helper function: returns company_id for the currently logged-in user
-- Works for both owners AND sub-accountants
CREATE OR REPLACE FUNCTION my_company_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  cid uuid;
BEGIN
  -- Check if owner
  SELECT id INTO cid FROM companies WHERE owner_id = auth.uid();
  IF cid IS NOT NULL THEN RETURN cid; END IF;
  -- Check if sub-accountant
  SELECT company_id INTO cid FROM sub_accountants
    WHERE auth_user_id = auth.uid() AND is_active = true;
  RETURN cid;
END;
$$;

-- COMPANIES policies
CREATE POLICY "owner reads own company"
  ON companies FOR SELECT USING (
    owner_id = auth.uid() OR
    id = my_company_id()
  );
CREATE POLICY "owner updates own company"
  ON companies FOR UPDATE USING (owner_id = auth.uid());

-- SUB_ACCOUNTANTS policies
CREATE POLICY "company members see accountants"
  ON sub_accountants FOR SELECT USING (company_id = my_company_id());
CREATE POLICY "owner manages accountants"
  ON sub_accountants FOR ALL USING (
    company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  );

-- SUBSCRIBERS policies
CREATE POLICY "company members see subscribers"
  ON subscribers FOR SELECT USING (company_id = my_company_id());
CREATE POLICY "owner and accountants write subscribers"
  ON subscribers FOR INSERT WITH CHECK (
    company_id = my_company_id() AND
    -- viewers cannot insert
    NOT EXISTS (
      SELECT 1 FROM sub_accountants
      WHERE auth_user_id = auth.uid() AND role = 'viewer' AND is_active = true
    )
  );
CREATE POLICY "owner and accountants update subscribers"
  ON subscribers FOR UPDATE USING (
    company_id = my_company_id() AND
    NOT EXISTS (
      SELECT 1 FROM sub_accountants
      WHERE auth_user_id = auth.uid() AND role = 'viewer' AND is_active = true
    )
  );
CREATE POLICY "owner soft-delete subscribers"
  ON subscribers FOR DELETE USING (
    company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  );

-- PAYMENTS policies
CREATE POLICY "company members see payments"
  ON payments FOR SELECT USING (company_id = my_company_id());
CREATE POLICY "owner and accountants insert payments"
  ON payments FOR INSERT WITH CHECK (
    company_id = my_company_id() AND
    NOT EXISTS (
      SELECT 1 FROM sub_accountants
      WHERE auth_user_id = auth.uid() AND role = 'viewer' AND is_active = true
    )
  );
CREATE POLICY "owner deletes payments"
  ON payments FOR DELETE USING (
    company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  );

-- SHEETS_CONFIG policies
CREATE POLICY "company reads own sheets config"
  ON sheets_config FOR SELECT USING (company_id = my_company_id());
CREATE POLICY "owner writes sheets config"
  ON sheets_config FOR ALL USING (
    company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  );

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subscribers_company ON subscribers(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_company    ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscriber ON payments(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_sub_acc_company     ON sub_accountants(company_id);
CREATE INDEX IF NOT EXISTS idx_sub_acc_auth_user   ON sub_accountants(auth_user_id);


-- ============================================================
-- ADDITIONAL: auth_user_id column for sub_accountants
-- (run if column doesn't exist yet)
-- ============================================================
ALTER TABLE sub_accountants ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE sub_accountants ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_template text;

-- Unique payment per subscriber+month (prevent duplicates at DB level)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_subscriber_id_month_key;
ALTER TABLE payments ADD CONSTRAINT payments_subscriber_id_month_key UNIQUE (subscriber_id, month);

-- ============================================================
-- subscription_requests table (needed for SubscribePlan)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       uuid REFERENCES companies(id) ON DELETE CASCADE,
  plan_key         text NOT NULL,
  amount           numeric(10,2),
  payment_image_url text,
  status           text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes      text,
  reviewed_by      text,
  reviewed_at      timestamptz,
  requested_at     timestamptz DEFAULT now()
);

ALTER TABLE subscription_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company reads own requests"
  ON subscription_requests FOR SELECT USING (company_id = my_company_id());
CREATE POLICY "company inserts own requests"
  ON subscription_requests FOR INSERT WITH CHECK (company_id = my_company_id());
-- Admin can read/update all (admin bypasses via service_role or is_admin flag)


-- ============================================================
-- ADD subscription_end to subscribers table
-- ============================================================
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS subscription_end date;

-- Index for fast expiry queries
CREATE INDEX IF NOT EXISTS idx_subscribers_end ON subscribers(subscription_end)
  WHERE subscription_end IS NOT NULL;

-- View: expiring subscribers (next 7 days)
CREATE OR REPLACE VIEW expiring_subscribers AS
  SELECT s.*, c.name as company_name
  FROM subscribers s
  JOIN companies c ON c.id = s.company_id
  WHERE s.is_active = true
    AND s.subscription_end IS NOT NULL
    AND s.subscription_end BETWEEN CURRENT_DATE AND CURRENT_DATE + 7;

