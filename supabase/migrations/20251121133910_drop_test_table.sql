-- Migration de prueba: eliminar tabla de prueba
-- Esta migración elimina la tabla creada en la migración anterior para completar la prueba

-- Eliminar el índice primero (se eliminará automáticamente con la tabla, pero por seguridad)
DROP INDEX IF EXISTS public.idx_test_table_created_at;

-- Eliminar la tabla de prueba
DROP TABLE IF EXISTS public.test_table_migration;








