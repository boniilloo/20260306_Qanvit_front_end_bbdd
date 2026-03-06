-- Drop the test table and its associated objects
-- First drop the policy
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON test_products;

-- Then drop the table (this will also drop the sequence automatically)
DROP TABLE IF EXISTS test_products;
