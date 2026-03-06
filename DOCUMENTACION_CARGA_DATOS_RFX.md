# Documentación: Carga de Datos en la Ruta de RFXs

## Resumen Ejecutivo

Este documento explica en detalle cómo funciona la carga de datos en la ruta de RFXs y el problema cíclico que se estaba produciendo en `useRFXValidations.ts`.

## Arquitectura de Carga de Datos

### 1. Componente Principal: `RFXProjects.tsx`

**Ubicación**: `src/pages/RFXProjects.tsx`

**Responsabilidades**:
- Lista todos los RFXs del usuario (como owner o member)
- Filtrado, búsqueda y ordenación de RFXs
- Paginación de resultados
- Creación y eliminación de RFXs

**Flujo de carga**:
1. El componente usa el hook `useRFXs()` que carga todos los RFXs al montar
2. Cada RFX se renderiza usando el componente `RFXCard`
3. Cada `RFXCard` usa:
   - `useRFXProgress(rfx.id)` - Para mostrar el progreso
   - `useRFXMembers(rfx.id)` - Para mostrar los miembros

### 2. Página de Detalle: `RFXDetail.tsx`

**Ubicación**: `src/pages/RFXDetail.tsx`

**Responsabilidades**:
- Mostrar detalles de un RFX específico
- Navegación entre secciones (Overview, Specs, Candidates)
- Gestión de especificaciones y propuestas

**Flujo de carga**:
1. Al montar, carga el RFX básico con `fetchRFX()`
2. Carga las especificaciones con `fetchSpecs()`
3. Usa `useRFXProgress(id)` para el progreso
4. Usa `useRFXEvaluationResults(id)` para los resultados de evaluación

### 3. Hook de Progreso: `useRFXProgress.ts`

**Ubicación**: `src/hooks/useRFXProgress.ts`

**Responsabilidades**:
- Calcular el progreso de un RFX (specs, candidates, validations)
- Mantener sincronización con la base de datos mediante suscripciones realtime

**Flujo de carga**:
1. Usa `useRFXValidations(rfxId)` para obtener datos de validación
2. Calcula el progreso basado en:
   - `rfx_specs` (description, technical_requirements, company_requirements)
   - `rfx_evaluation_results` (resultados de evaluación)
   - `rfx_selected_candidates` (candidatos seleccionados)
   - `rfx_validations` (validaciones de miembros)
3. Establece suscripciones realtime para actualizar automáticamente cuando cambian los datos

### 4. Hook de Validaciones: `useRFXValidations.ts`

**Ubicación**: `src/hooks/useRFXValidations.ts`

**Responsabilidades**:
- Gestionar las validaciones de los miembros del RFX
- Determinar si todos los miembros han validado
- Mantener sincronización con cambios en validaciones y miembros

**Flujo de carga**:
1. Al montar, ejecuta `loadValidations()` que:
   - Obtiene el owner del RFX desde `rfxs.user_id`
   - Obtiene todos los miembros desde `rfx_members`
   - Combina owner + miembros en una lista única
   - Obtiene todas las validaciones desde `rfx_validations`
   - Calcula si todos los miembros han validado
2. Establece suscripciones realtime para `rfx_validations` y `rfx_members`
3. Cuando hay cambios, vuelve a ejecutar `loadValidations()`

## Problema Cíclico Identificado

### Síntomas
Los logs aparecían continuamente en la consola:
```
🔍 [RFX Validations] Members loaded: {...}
🔍 [RFX Validations] Validation check: {...}
🔍 [RFX Validations] All validated? false
🔍 [RFX Validations] Members without validation: [...]
```

### Causa Raíz

El problema estaba en el `useEffect` de suscripciones (líneas 137-173 de `useRFXValidations.ts`):

```typescript
useEffect(() => {
  if (!rfxId) return;
  
  const channel = supabase.channel(...)
    .on('postgres_changes', {...}, () => {
      loadValidations(); // ← Llama a loadValidations
    })
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, [rfxId, loadValidations]); // ← Dependencia de loadValidations
```

**El ciclo se producía así**:

1. `loadValidations` se ejecuta y actualiza estados (`members`, `validations`, `allMembersValidated`)
2. Estos cambios de estado pueden disparar efectos que recrean el callback
3. Aunque `loadValidations` es un `useCallback` estable, estar en las dependencias del `useEffect` de suscripciones puede causar que las suscripciones se recreen
4. Cuando las suscripciones se recrean, pueden disparar eventos inmediatamente
5. Estos eventos llaman a `loadValidations()` de nuevo
6. El ciclo se repite

### Solución Aplicada

1. **Usar `useRef` para mantener una referencia estable a `loadValidations`**:
   ```typescript
   // Crear un ref que siempre apunte a la última versión de loadValidations
   const loadValidationsRef = useRef(loadValidations);
   useEffect(() => {
     loadValidationsRef.current = loadValidations;
   }, [loadValidations]);
   ```
   - Esto asegura que tenemos siempre la última versión de la función
   - Pero sin causar recreaciones de las suscripciones

2. **Usar el ref en las suscripciones**:
   ```typescript
   useEffect(() => {
     if (!rfxId) return;
     
     const channel = supabase.channel(...)
       .on('postgres_changes', {...}, () => {
         loadValidationsRef.current(); // ← Usar ref en lugar de función directa
       })
       .subscribe();
     
     return () => {
       supabase.removeChannel(channel);
     };
   }, [rfxId]); // ← Solo depende de rfxId, NO de loadValidations
   ```

3. **Evitar dependencias innecesarias**:
   - El `useEffect` de suscripciones solo depende de `rfxId`
   - `loadValidations` NO está en las dependencias
   - Esto evita que las suscripciones se recreen cuando cambia `loadValidations`
   - Las suscripciones solo se recrean cuando cambia el `rfxId`

## Flujo Completo de Datos

### Al cargar la página RFXProjects:

```
RFXProjects.tsx
  └─> useRFXs() → Carga lista de RFXs
  └─> Para cada RFX:
      └─> RFXCard
          └─> useRFXProgress(rfx.id)
              └─> useRFXValidations(rfx.id)
                  └─> loadValidations()
                      ├─> Consulta rfx_members
                      ├─> Consulta rfx_validations
                      └─> Calcula allMembersValidated
              └─> fetchProgressData()
                  ├─> Consulta rfx_specs
                  ├─> Consulta rfx_evaluation_results
                  └─> Consulta rfx_selected_candidates
          └─> useRFXMembers(rfx.id)
              └─> loadMembers()
```

### Cuando hay cambios en tiempo real:

```
Cambio en BD (rfx_validations o rfx_members)
  └─> Supabase Realtime dispara evento
      └─> Callback en useRFXValidations
          └─> loadValidations() (a través de ref)
              └─> Actualiza estados
                  └─> useRFXProgress detecta cambios
                      └─> fetchProgressData()
                          └─> Actualiza UI
```

## Puntos Clave de la Arquitectura

1. **Separación de responsabilidades**: Cada hook maneja un aspecto específico del RFX
2. **Suscripciones realtime**: Los datos se actualizan automáticamente cuando cambian en la BD
3. **Referencias estables**: Se usan `useRef` para evitar recreaciones innecesarias de callbacks
4. **Evitar ciclos**: Las dependencias de los `useEffect` deben ser mínimas y estratégicas

## Mejoras Implementadas

1. ✅ Usar `useRef` para `loadValidations` en las suscripciones
2. ✅ Eliminar `loadValidations` de las dependencias del `useEffect` de suscripciones
3. ✅ Mantener la funcionalidad de actualización automática mediante realtime
4. ✅ Evitar recreaciones innecesarias de suscripciones

