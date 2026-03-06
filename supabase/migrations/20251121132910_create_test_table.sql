-- Migration de prueba: crear tabla de prueba
-- Esta migración es solo para verificar que el proceso de push funciona correctamente

CREATE TABLE IF NOT EXISTS public.test_table_migration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    test_data JSONB
);

-- Crear un índice de prueba
CREATE INDEX IF NOT EXISTS idx_test_table_created_at ON public.test_table_migration(created_at);

-- Habilitar RLS (aunque no es necesario para una tabla de prueba)
ALTER TABLE public.test_table_migration ENABLE ROW LEVEL SECURITY;

-- Comentario para documentar
COMMENT ON TABLE public.test_table_migration IS 'Tabla de prueba temporal para verificar el proceso de migración';








