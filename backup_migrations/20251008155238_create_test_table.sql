-- Create a simple test table with two columns
CREATE TABLE test_products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add some sample data
INSERT INTO test_products (name, price) VALUES 
    ('Producto de Prueba 1', 29.99),
    ('Producto de Prueba 2', 49.50),
    ('Producto de Prueba 3', 15.75);

-- Enable Row Level Security (RLS) for the table
ALTER TABLE test_products ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON test_products
    FOR ALL USING (auth.role() = 'authenticated');

