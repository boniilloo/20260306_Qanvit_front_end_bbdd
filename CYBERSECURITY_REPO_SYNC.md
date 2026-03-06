# Guía de Sincronización de Cybersecurity Reports

Esta guía explica cómo sincronizar la carpeta `cybersecurity_report_20251127` con un repositorio público de GitHub.

## ✅ Configuración Actual

**Repositorio público:** [https://github.com/boniilloo/FQ-Source-Cybersecurity-20251202](https://github.com/boniilloo/FQ-Source-Cybersecurity-20251202)

**Remoto configurado:** `cybersecurity-public`

## Opción 1: Git Subtree (Recomendado) ✅ CONFIGURADO

Esta opción mantiene la carpeta en el repositorio actual y la sincroniza con un repositorio público separado.

### Estado Actual:
- ✅ Remoto `cybersecurity-public` configurado
- ✅ Push inicial completado
- ✅ Repositorio público: [FQ-Source-Cybersecurity-20251202](https://github.com/boniilloo/FQ-Source-Cybersecurity-20251202)

### Sincronizaciones Futuras:

Cuando hagas cambios en la carpeta `cybersecurity_report_20251127` y quieras sincronizarlos con el repositorio público:

```bash
# Opción A: Usar el script (recomendado)
./sync-cybersecurity-reports.sh

# Opción B: Comando manual
git subtree push --prefix=cybersecurity_report_20251127 cybersecurity-public main
```

**Nota:** Si tienes cambios sin commitear en la carpeta, el script te preguntará si quieres hacer commit antes de sincronizar.

### Ventajas:
- ✅ Mantiene la carpeta en el repositorio principal
- ✅ Sincronización automática con un comando
- ✅ Historial de commits preservado

---

## Opción 2: Repositorio Separado (Más Simple)

Esta opción crea un repositorio completamente independiente solo para los reports.

### Pasos:

1. **Crear un repositorio público en GitHub:**
   - Ve a GitHub y crea un nuevo repositorio público (ej: `cybersecurity-reports`)

2. **Inicializar git en la carpeta:**
   ```bash
   cd cybersecurity_report_20251127
   git init
   git add .
   git commit -m "Initial commit: Cybersecurity reports"
   ```

3. **Conectar con el repositorio remoto:**
   ```bash
   git remote add origin git@github.com:TU_USUARIO/cybersecurity-reports.git
   git branch -M main
   git push -u origin main
   ```

4. **Sincronizaciones futuras:**
   ```bash
   cd cybersecurity_report_20251127
   git add .
   git commit -m "Update cybersecurity reports"
   git push
   ```

### Ventajas:
- ✅ Más simple de configurar
- ✅ Repositorio completamente independiente
- ✅ Fácil de mantener

### Desventajas:
- ⚠️ Requiere mantener dos repositorios separados
- ⚠️ No mantiene el historial del repositorio principal

---

## Recomendación

**Usa la Opción 1 (Git Subtree)** si:
- Quieres mantener la carpeta en el repositorio principal
- Necesitas sincronizar automáticamente
- Quieres preservar el historial completo

**Usa la Opción 2 (Repositorio Separado)** si:
- Prefieres simplicidad
- No necesitas mantener la carpeta en el repo principal
- Quieres un repositorio completamente independiente

---

## Notas Importantes

- ⚠️ **Confidencialidad**: Asegúrate de que el contenido de los reports no contenga información sensible antes de hacerlo público
- ⚠️ **PDF**: El archivo `Data Processing Agreement (FQ Source Technologies SL and OpenAI).pdf` es grande (362KB). Considera si quieres incluirlo en el repositorio público
- ⚠️ **Actualizaciones**: Recuerda sincronizar después de cada cambio en los reports

