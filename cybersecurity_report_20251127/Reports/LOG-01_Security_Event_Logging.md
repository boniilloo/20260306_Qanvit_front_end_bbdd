# Cybersecurity Audit - Control LOG-01

## Control Information

- **Control ID**: LOG-01
- **Control Name**: Security Event Logging
- **Audit Date**: 2025-11-27
- **Client Question**: "What security events do you log?"

---

## Executive Summary

⚠️ **PARTIAL COMPLIANCE**: The platform implements comprehensive logging infrastructure through Grafana Loki integration, capturing connection events, system errors, and application exceptions. However, the logging system is primarily operational and debugging-oriented rather than explicitly security-focused. While the infrastructure exists to log security events, there is no formal logging policy document, and specific security events such as authentication failures, authorization denials, and access control violations are not explicitly logged with security-focused context.

1. **Logging infrastructure present** - Grafana Loki integration provides centralized logging with structured labels and metadata
2. **Connection and system events logged** - WebSocket connections, system resource usage, and application errors are captured
3. **Missing security-specific events** - Authentication failures, authorization denials, and access control violations are not explicitly logged as security events
4. **No formal logging policy** - No documented logging policy specifying which security events should be logged
5. **Operational focus** - Current logging is primarily for debugging and operational monitoring rather than security auditing

---

## 1. Logging Infrastructure

The platform implements a centralized logging system using **Grafana Loki** for log aggregation and storage. The infrastructure consists of multiple components that capture and forward logs from various application components.

### 1.1. Grafana Loki Client

The platform uses Grafana Cloud Loki as the centralized logging service. The Loki client is initialized at application startup and provides structured logging capabilities with labels and metadata.

**Evidence**:
```python
// agent/tools/grafana_loki_client.py
class GrafanaLokiClient:
    """
    Cliente para enviar logs directamente a Grafana Loki via HTTP API
    """
    
    def __init__(self):
        # Grafana Cloud Loki configuration
        self.loki_url = os.getenv("LOKI_URL", "https://logs-prod-012.grafana.net")
        self.loki_user = os.getenv("LOKI_USER", "1293489")
        self.loki_password = os.getenv("LOKI_PASSWORD")  # API token
        
        if not self.loki_password:
            raise ValueError("LOKI_PASSWORD environment variable is required")
        
        # Configure basic authentication
        self.auth = (self.loki_user, self.loki_password)
        
        # Headers for requests
        self.headers = {
            'Content-Type': 'application/json',
            'X-Scope-OrgID': 'fqsource'  # Organization identifier
        }
```

The Loki client configuration includes:
- **Organization ID**: `fqsource` for organizational isolation
- **Authentication**: Basic authentication using API token
- **Structured labels**: Support for custom labels including `level`, `source`, `component`, and `event_type`

### 1.2. Print Interceptor System

All standard output and error streams are automatically intercepted through a `PrintInterceptor` class that captures application logs and forwards them to Loki with structured metadata.

**Evidence**:
```python
// agent/tools/print_interceptor.py
class PrintInterceptor:
    """
    Interceptor that captures all prints and sends them to Loki
    """
    
    def write(self, text):
        """Intercepts writes to stdout/stderr"""
        # Write to original stdout
        self.original_stdout.write(text)
        self.original_stdout.flush()
        
        # Send to Loki if it's not a Loki message and doesn't contain intermediate_step
        if not text.startswith("[LOKI]"):
            # Filter messages containing intermediate_step
            if "intermediate_step" not in text:
                self._queue_log(text.strip(), "print")
    
    def _queue_log(self, message: str, level: str = "info", labels: Optional[dict] = None):
        """Adds a log to the queue for processing"""
        if message and message.strip():
            # Combine global labels with specific labels
            combined_labels = self.global_labels.copy()
            if labels:
                combined_labels.update(labels)
            
            log_data = {
                'message': message.strip(),
                'level': level,
                'labels': combined_labels,
                'timestamp': datetime.utcnow()
            }
```

The print interceptor provides:
- **Automatic capture**: All print statements are automatically logged
- **Batch processing**: Logs are batched for efficient transmission (default batch size: 10, timeout: 5 seconds)
- **Global context**: Labels such as `conversation_id` are automatically included in all logs
- **Background processing**: Non-blocking log transmission via dedicated thread

### 1.3. Log Initialization

The logging infrastructure is initialized at application startup in the main webserver module.

**Evidence**:
```python
// api/webserver.py
# Inicializar interceptor de prints para Loki
try:
    from agent.tools.print_interceptor import start_print_interceptor, stop_print_interceptor, set_conversation_id
    print_interceptor = start_print_interceptor()
    print("[INFO] Grafana Loki interceptor started successfully")
except Exception as e:
    print(f"[WARNING] Failed to start Grafana Loki interceptor: {e}")
    print_interceptor = None
    set_conversation_id = None

# Inicializar cliente Loki para logging de conexiones
try:
    from agent.tools.grafana_loki_client import get_loki_client
    loki_client = get_loki_client()
    print("[INFO] Grafana Loki client initialized for connection logging")
except Exception as e:
    print(f"[WARNING] Failed to initialize Grafana Loki client: {e}")
    loki_client = None
```

---

## 2. Currently Logged Events

The platform logs various types of events, primarily focused on operational monitoring and debugging rather than explicit security events.

### 2.1. WebSocket Connection Events

WebSocket connection lifecycle events are logged when connections are opened or closed, including session identifiers and connection counts.

**Evidence**:
```python
// api/webserver.py
def log_connection_event(event_type: str, session_id: str, total_connections: int, client_info: str = None):
    """
    Sends a log to Loki when a WebSocket connection is opened or closed
    
    Args:
        event_type: 'connection_opened' or 'connection_closed'
        session_id: Unique session ID
        total_connections: Total number of active connections
        client_info: Additional client information (optional)
    """
    if loki_client is None:
        return
    
    try:
        message = f"WebSocket {event_type}: session_id={session_id}, total_connections={total_connections}"
        if client_info:
            message += f", client_info={client_info}"
        
        labels = {
            "event_type": event_type,
            "session_id": session_id,
            "total_connections": str(total_connections),
            "component": "websocket_connection_tracker"
        }
        
        if client_info:
            labels["client_info"] = client_info
        
        loki_client.send_log(
            message=message,
            level="info",
            labels=labels
        )
    except Exception as e:
        print(f"[ERROR] Failed to send connection log to Loki: {e}")
```

Connection events are logged with:
- **Event type**: `connection_opened` or `connection_closed`
- **Session ID**: Unique identifier for each WebSocket session
- **Total connections**: Current number of active connections
- **Client info**: Optional client information (e.g., "rfx_agent", "rfx_conversational_agent")

### 2.2. System Resource Monitoring

System resource usage (CPU and memory) is logged periodically every 5 seconds for operational monitoring.

**Evidence**:
```python
// api/webserver.py
def log_system_usage():
    """
    Sends a log to Loki with system memory and CPU usage
    """
    if loki_client is None:
        return
    
    try:
        # Get memory usage
        memory = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=1)
        
        message = f"System usage: CPU={cpu_percent}%, Memory={memory.percent}%, Available={memory.available / (1024**3):.2f}GB"
        
        labels = {
            "component": "system_monitor",
            "event_type": "system_usage",
            "cpu_percent": str(cpu_percent),
            "memory_percent": str(memory.percent),
            "memory_available_gb": str(memory.available / (1024**3))
        }
        
        loki_client.send_log(
            message=message,
            level="info",
            labels=labels
        )
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    except Exception as e:
        print(f"[ERROR] Failed to send system log to Loki: {e}")

def start_system_logging():
    """
    Starts periodic system logging (memory and CPU) in a separate thread
    """
    def system_logging_worker():
        while ram_logging_active:
            try:
                log_system_usage()
                cleanup_inactive_websockets()
                time.sleep(5)  # Log cada 5 segundos
            except Exception as e:
                print(f"[ERROR] Error in system logging worker: {e}")
                time.sleep(5)  # Continuar intentando
```

System monitoring logs include:
- **CPU usage**: Percentage of CPU utilization
- **Memory usage**: Percentage and available memory in GB
- **Frequency**: Logged every 5 seconds

### 2.3. Application Errors and Exceptions

Application errors and exceptions are logged through the print interceptor system, capturing error messages, exception types, and stack traces.

**Evidence**:
```python
// agent/tools/vector_query.py
except Exception as e:
    total_time = time.time() - total_start_time
    import traceback
    error_traceback = traceback.format_exc()
    
    print(f"[VECTOR_QUERY] [ERROR] Exception caught after {total_time:.3f}s")
    print(f"[VECTOR_QUERY] [ERROR] Type: {type(e).__name__}")
    print(f"[VECTOR_QUERY] [ERROR] Message: {str(e)}")
    print(f"[VECTOR_QUERY] [ERROR] Full traceback:")
    print(error_traceback)

    error_info = {
        "query": query,
        "total_duration": f"{total_time:.3f}",
        "error_message": str(e),
        "error_type": type(e).__name__,
        "error_traceback": error_traceback,
        "match_count": match_count,
        "match_threshold": match_threshold
    }

    try:
        log_to_loki(
            json.dumps(error_info, ensure_ascii=False),
            level="error",
            labels={
                "component": "tool",
                "event_type": "tool_error",
                "tool_name": "vector_query_tool",
                "total_duration": f"{total_time:.3f}",
                "status": "error"
            }
        )
    except Exception as log_error:
        print(f"[VECTOR_QUERY] [ERROR] No se pudo loguear a Loki: {log_error}")
```

Error logging includes:
- **Error type**: Exception class name
- **Error message**: Exception message
- **Stack trace**: Full traceback for debugging
- **Context**: Tool name, component, and relevant parameters
- **Level**: Logged with `level="error"` for filtering

### 2.4. Conversation and Session Tracking

All logs are tagged with `conversation_id` and `session_id` for traceability and session reconstruction.

**Evidence**:
```python
// api/webserver.py
# Establecer conversation_id en el contexto de Loki
if set_conversation_id:
    set_conversation_id(conversation_id)
    print(f"[INFO] Set conversation_id in Loki context: {conversation_id}")

// agent/tools/print_interceptor.py
def set_conversation_id(conversation_id: str):
    """Sets the conversation ID for all logs"""
    if conversation_id:
        set_loki_context({"conversation_id": conversation_id})
    else:
        clear_loki_context()
```

Conversation tracking provides:
- **Session isolation**: Each WebSocket session has a unique `session_id`
- **Conversation tracking**: All logs within a conversation are tagged with `conversation_id`
- **Context propagation**: Conversation ID is automatically included in all logs via global labels

---

## 3. Missing Security Events

While the platform has comprehensive logging infrastructure, specific security-oriented events are not explicitly logged with security-focused context.

### 3.1. Authentication Events

The platform does not explicitly log authentication-related security events such as:
- **Authentication failures**: Failed login attempts, invalid credentials
- **Authentication successes**: Successful logins (though conversation_id assignment may indicate this)
- **Session establishment**: Authentication token validation, session creation
- **Token expiration**: Expired or invalid authentication tokens

**Current State**: The platform uses Supabase Auth for authentication, but authentication events are not explicitly logged as security events. The WebSocket connection logging captures session establishment, but does not distinguish between authenticated and unauthenticated sessions or log authentication failures.

### 3.2. Authorization Events

The platform does not explicitly log authorization-related security events such as:
- **Authorization failures**: Access denied due to insufficient permissions
- **Privilege escalation attempts**: Unauthorized attempts to access restricted resources
- **Role-based access control violations**: Attempts to access resources outside assigned roles
- **Permission checks**: Authorization decisions and their outcomes

**Current State**: While the platform may implement authorization checks (e.g., through Supabase Row Level Security), these authorization decisions and failures are not explicitly logged as security events.

### 3.3. Access Control Violations

The platform does not explicitly log access control violations such as:
- **Unauthorized access attempts**: Attempts to access resources without proper authorization
- **Data access violations**: Unauthorized attempts to access sensitive data
- **API endpoint access**: Unauthorized attempts to access protected endpoints
- **Resource access patterns**: Unusual or suspicious access patterns

**Current State**: Error logging may capture some access control violations indirectly (e.g., database errors from RLS policies), but these are not explicitly logged with security-focused context and labels.

### 3.4. Security Policy Violations

The platform does not explicitly log security policy violations such as:
- **Input validation failures**: Malicious or malformed input attempts
- **Rate limiting violations**: Excessive request rates
- **Security control bypass attempts**: Attempts to circumvent security controls
- **Suspicious activity patterns**: Anomalous behavior that may indicate security threats

**Current State**: While input validation and other security controls may be implemented, violations are not explicitly logged as security events with appropriate severity levels and security-focused labels.

---

## 4. Logging Policy

The platform does not have a formal, documented logging policy that specifies:
- Which security events should be logged
- What information should be included in security logs
- How long security logs should be retained
- Who has access to security logs
- How security logs should be monitored and analyzed

**Current State**: No logging policy document was found in the codebase. The logging implementation is driven by operational needs rather than a formal security logging policy.

---

## 5. Log Structure and Metadata

The current logging system uses structured labels and metadata, which provides a foundation for security event logging, but the labels are primarily operational rather than security-focused.

### 5.1. Current Label Structure

Logs include labels such as:
- `level`: Log level (info, error, warning, debug)
- `source`: Source component (e.g., "rag_agent")
- `component`: Component name (e.g., "websocket_connection_tracker", "system_monitor", "tool")
- `event_type`: Event type (e.g., "connection_opened", "connection_closed", "system_usage", "tool_error")
- `conversation_id`: Conversation identifier for traceability
- `session_id`: Session identifier for WebSocket connections

**Evidence**:
```python
// agent/tools/grafana_loki_client.py
# Labels por defecto
default_labels = {
    "level": level,
    "source": "rag_agent",
    "component": "websocket_handler"
}

# Combinar con labels adicionales
if labels:
    processed_labels = {}
    for key, value in labels.items():
        # Try to convert values that look like numbers to float
        if isinstance(value, str) and self._is_numeric_string(value):
            try:
                processed_labels[key] = str(float(value))
            except ValueError:
                processed_labels[key] = value
        else:
            processed_labels[key] = value
    default_labels.update(processed_labels)
```

### 5.2. Security-Focused Labels Missing

For security event logging, additional labels should be considered:
- `security_event_type`: Type of security event (authentication, authorization, access_control, etc.)
- `user_id`: User identifier for the event
- `ip_address`: Source IP address
- `user_agent`: Client user agent
- `resource`: Resource being accessed
- `action`: Action being performed
- `outcome`: Success or failure
- `severity`: Security severity level (low, medium, high, critical)
- `threat_level`: Threat level assessment

---

## 6. Log Retention and Access

The platform uses Grafana Cloud Loki for log storage, but there is no documented policy regarding:
- **Log retention period**: How long logs are retained
- **Log access controls**: Who can access security logs
- **Log integrity**: How log tampering is prevented
- **Log backup**: How logs are backed up for compliance

**Current State**: Logs are stored in Grafana Cloud Loki, but retention and access policies are not documented in the codebase.

---

## 7. Conclusions

### 7.1. Strengths

✅ **Comprehensive logging infrastructure**: The platform has a robust logging infrastructure using Grafana Loki with structured labels and metadata, providing a solid foundation for security event logging.

✅ **Automatic log capture**: The print interceptor system automatically captures all application output, ensuring comprehensive coverage of application events.

✅ **Structured logging format**: Logs use structured labels and metadata, making them queryable and analyzable for security purposes.

✅ **Conversation traceability**: All logs are tagged with conversation_id and session_id, enabling complete session reconstruction for incident investigation.

✅ **Centralized log storage**: Centralized log storage in Grafana Cloud provides a single source of truth for log analysis.

### 7.2. Recommendations

1. **Develop a formal logging policy**: Create a documented logging policy that specifies which security events should be logged, what information should be included, retention periods, and access controls.

2. **Implement explicit security event logging**: Add explicit logging for security events such as:
   - Authentication successes and failures (with user_id, IP address, outcome)
   - Authorization decisions and failures (with user_id, resource, action, outcome)
   - Access control violations (with user_id, resource, attempted action)
   - Security policy violations (with violation type, severity, threat level)

3. **Add security-focused labels**: Extend the logging system to include security-focused labels such as `security_event_type`, `user_id`, `ip_address`, `severity`, and `threat_level` for security events.

4. **Implement security event classification**: Classify logged events as security events with appropriate severity levels (low, medium, high, critical) to enable prioritized monitoring and alerting.

5. **Create security log monitoring**: Implement monitoring and alerting for security events, such as:
   - Multiple authentication failures from the same IP
   - Authorization failures for sensitive resources
   - Unusual access patterns
   - Security policy violations

6. **Document log retention and access**: Document log retention periods, access controls, and backup procedures for compliance and audit purposes.

---

## 8. Control Compliance

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Logging infrastructure exists | ✅ COMPLIANT | Grafana Loki integration with structured logging |
| Connection events logged | ✅ COMPLIANT | WebSocket connection lifecycle events logged |
| System events logged | ✅ COMPLIANT | System resource usage and errors logged |
| Application errors logged | ✅ COMPLIANT | Application exceptions and errors logged with context |
| Security events explicitly logged | ❌ NON-COMPLIANT | Authentication, authorization, and access control events not explicitly logged as security events |
| Logging policy documented | ❌ NON-COMPLIANT | No formal logging policy document found |
| Security-focused log structure | ⚠️ PARTIAL | Logging infrastructure supports security events but labels are operational-focused |

**FINAL VERDICT**: ⚠️ **PARTIALLY COMPLIANT** with control LOG-01. The platform implements comprehensive logging infrastructure through Grafana Loki integration, capturing connection events, system errors, and application exceptions. However, the logging system is primarily operational and debugging-oriented rather than explicitly security-focused. While the infrastructure exists to log security events, there is no formal logging policy document, and specific security events such as authentication failures, authorization denials, and access control violations are not explicitly logged with security-focused context. To achieve full compliance, the platform should develop a formal logging policy, implement explicit security event logging, and add security-focused labels and classification to the logging system.

---

## Appendices

### A. Grafana Loki Query Examples

Security event queries that could be implemented once security event logging is added:

```logql
# Authentication failures
{component="security" security_event_type="authentication" outcome="failure"}

# Authorization failures
{component="security" security_event_type="authorization" outcome="failure"}

# High severity security events
{component="security" severity="high"}

# Security events by user
{component="security" user_id="<user_id>"}
```

### B. Recommended Security Event Types

Security events that should be logged:

1. **Authentication Events**:
   - Login success
   - Login failure
   - Logout
   - Session expiration
   - Token validation failure

2. **Authorization Events**:
   - Authorization success
   - Authorization failure
   - Privilege escalation attempt
   - Role change

3. **Access Control Events**:
   - Resource access granted
   - Resource access denied
   - Unauthorized access attempt
   - Data access violation

4. **Security Policy Events**:
   - Input validation failure
   - Rate limit violation
   - Security control bypass attempt
   - Suspicious activity detected

### C. Logging Policy Template

A logging policy should include:

1. **Scope**: What events should be logged
2. **Information to include**: What data should be in each log entry
3. **Retention**: How long logs should be retained
4. **Access**: Who can access logs and under what conditions
5. **Monitoring**: How logs should be monitored and analyzed
6. **Incident response**: How logs should be used in incident response
7. **Compliance**: How logging supports compliance requirements

---

**End of Audit Report - Control LOG-01**

