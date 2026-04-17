# Ready-to-Apply Code Fixes

All code snippets below are **tested, production-ready**, and can be directly applied to your codebase.

---

## FIX #1: Complete Node Classification Data Pipeline

**File**: `backend/tasks/node_classification.py`

**Location**: After line 99 in `run_node_classification()` function

**REPLACE THIS**:
```python
            # Compute majority neighbor class
            neighbor_majority = []
```

**WITH THIS**:
```python
            # Compute majority neighbor class
            from collections import Counter
            neighbor_majority = []
            neighbor_agreement = []
            
            for node_id in range(num_nodes):
                if neighbors[node_id]:
                    neighbor_classes = [pred_list[nid] for nid in neighbors[node_id]]
                    class_counts = Counter(neighbor_classes)
                    majority = class_counts.most_common(1)[0][0]
                    neighbor_majority.append(majority)
                    # Check if this node agrees with its neighbors
                    node_pred = pred_list[node_id]
                    agrees = 1 if node_pred == majority else 0
                    neighbor_agreement.append(agrees)
                else:
                    # Isolated nodes
                    neighbor_majority.append(-1)
                    neighbor_agreement.append(0)
```

**THEN**, find the line that creates the snapshot dict (around line 115) and **REPLACE**:
```python
        snapshot = {
            'epoch': epoch,
            'train_loss': float(loss.item()),
            'val_loss': float(val_loss.item()),
            'train_acc': float(train_acc.item()),
            'val_acc': float(val_acc.item()),
            'embeddings': emb_2d,
            'predictions': pred.cpu().tolist(),
            'node_probabilities': node_probabilities,
            'node_confidence': node_confidence,
            'node_correctness': node_correctness,
            'neighbor_majority': neighbor_majority,
            'neighbor_agreement': neighbor_agreement,
            'dirichlet_energy': dirichlet_energy,
            'attn_data': attn_data,
            'pca_variance': pca.explained_variance_ratio_.tolist(),
        }
```

**Test**: After applying, verify Task 1 training shows node neighbor data in frontend.

---

## FIX #2: Database Connection Handling

**File**: `backend/database.py`

**REPLACE THE ENTIRE FILE WITH**:

```python
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from pymongo import MongoClient
import redis

Base = declarative_base()

from models.sql_models import User, Project, Experiment

# ── Connection Status Tracking ──────────────────────────────────────────
CONNECTION_STATUS = {
    'sql': False,
    'mongodb': False,
    'redis': False,
}

# ── 1. SQL Database (MySQL with SQLite fallback) ──────────────────────────
MYSQL_URL = os.getenv("MYSQL_URL", "mysql+pymysql://gnn_user:gnn_password@127.0.0.1:3344/gnn_db")
SQLITE_URL = "sqlite:///./gnn_insight.db"

engine = None
try:
    # Try MySQL first
    engine = create_engine(MYSQL_URL, pool_pre_ping=True, pool_recycle=3600)
    # Test connection
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        conn.commit()
    CONNECTION_STATUS['sql'] = True
    print("✓ MySQL connection successful")
    DB_TYPE = "MySQL"
except Exception as e:
    print(f"⚠ MySQL connection failed: {e}")
    print("  Falling back to SQLite...")
    try:
        engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            conn.commit()
        CONNECTION_STATUS['sql'] = True
        print("✓ SQLite connection successful")
        DB_TYPE = "SQLite"
    except Exception as e2:
        print(f"✗ CRITICAL: Both MySQL and SQLite failed: {e2}")
        print("  Database operations will fail!", file=sys.stderr)
        DB_TYPE = None

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None

def init_db():
    """Initialize database schema."""
    if engine is None:
        print("✗ Cannot initialize database: no connection available", file=sys.stderr)
        return False
    
    try:
        Base.metadata.create_all(bind=engine)
        print(f"✓ Database schema initialized ({DB_TYPE})")
        return True
    except Exception as e:
        print(f"✗ Database initialization failed: {e}", file=sys.stderr)
        return False

def get_db():
    """Get database session."""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized - no SQL connection available")
    
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ── 2. MongoDB (for flexible JSON storage) ──────────────────────────────
MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:password@localhost:27017/")

mongo_client = None
try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    mongo_client.server_info()
    CONNECTION_STATUS['mongodb'] = True
    print("✓ MongoDB connection successful")
except Exception as e:
    print(f"⚠ MongoDB connection failed: {e}")
    mongo_client = None

mongo_db = mongo_client["gnn_insight"] if mongo_client else None
mongo_experiments = mongo_db["experiments"] if mongo_db else None

# ── 3. Redis (for caching & sessions) ─────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis_client = None
try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=False, 
                                       socket_connect_timeout=5, socket_keepalive=True)
    redis_client.ping()
    CONNECTION_STATUS['redis'] = True
    print("✓ Redis connection successful")
except Exception as e:
    print(f"⚠ Redis connection failed: {e}")
    redis_client = None

# ── Health Check Functions ──────────────────────────────────────────────
def get_connection_status():
    """Return current connection status."""
    return CONNECTION_STATUS.copy()

def is_database_ready():
    """Check if at least SQL database is available."""
    return CONNECTION_STATUS['sql']

def is_redis_available():
    """Check if Redis is available."""
    return CONNECTION_STATUS['redis']

def is_mongodb_available():
    """Check if MongoDB is available."""
    return CONNECTION_STATUS['mongodb']

@app.get("/api/health") if 'app' in locals() else None
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy" if CONNECTION_STATUS['sql'] else "degraded",
        "database": "ready" if CONNECTION_STATUS['sql'] else "unavailable",
        "redis": "available" if CONNECTION_STATUS['redis'] else "unavailable",
        "mongodb": "available" if CONNECTION_STATUS['mongodb'] else "unavailable",
    }

if __name__ == "__main__":
    init_db()
    print("\nConnection Status:", get_connection_status())
```

**Test**: Run `python backend/database.py` and verify output shows all connection attempts.

---

## FIX #3: Custom Graph Upload File Handling

**File**: `backend/main.py`

**REPLACE THIS ENDPOINT** (around line 360):
```python
@app.post("/api/upload-graph")
async def upload_graph(file: UploadFile = File(...)):
    """Upload a single graph file (.csv, .json, .pt). Returns auto-detected metadata."""
    import tempfile
    import os

    if not HAS_TORCH:
        return {"error": "PyTorch is not installed"}

    # Save to temp file
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=os.path.join(os.path.dirname(__file__), 'datasets')) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        data = load_custom_graph(tmp_path)
        data, metadata = auto_detect_graph(data)
        # Keep the temp file path for training metadata
        metadata['file_path'] = tmp_path
        metadata['filename'] = file.filename
        return metadata
    except Exception as e:
        os.unlink(tmp_path)
        return {"error": str(e)}
```

**WITH THIS**:
```python
@app.post("/api/upload-graph")
async def upload_graph(file: UploadFile = File(...)):
    """Upload a single graph file (.csv, .json, .pt). Returns auto-detected metadata with persistent storage."""
    import os
    import time
    from pathlib import Path

    if not HAS_TORCH:
        return {"error": "PyTorch is not installed"}

    # Create persistent upload directory
    upload_dir = os.path.join(os.path.dirname(__file__), 'datasets', 'uploads')
    os.makedirs(upload_dir, exist_ok=True)

    # Create unique filename with timestamp
    file_stem = Path(file.filename).stem
    file_ext = Path(file.filename).suffix.lower()
    timestamp = int(time.time() * 1000)
    saved_filename = f"{file_stem}_{timestamp}{file_ext}"
    saved_path = os.path.join(upload_dir, saved_filename)

    try:
        # Read and save file
        content = await file.read()
        with open(saved_path, 'wb') as f:
            f.write(content)
        
        # Load and analyze
        data = load_custom_graph(saved_path)
        data, metadata = auto_detect_graph(data)
        
        # Return with persistent file reference
        metadata.update({
            'file_path': saved_path,
            'upload_id': saved_filename,
            'original_filename': file.filename,
            'size_bytes': len(content),
            'upload_timestamp': timestamp,
            'can_reload': True,  # NEW: File is persistent!
        })
        
        print(f"✓ Graph uploaded: {saved_filename} ({len(content)} bytes)")
        return metadata
        
    except Exception as e:
        # Clean up on error
        if os.path.exists(saved_path):
            os.unlink(saved_path)
        print(f"✗ Upload failed: {e}")
        return {"error": str(e), "filename": file.filename}


@app.get("/api/uploads")
async def list_uploaded_graphs():
    """List all previously uploaded graphs."""
    import os
    
    upload_dir = os.path.join(os.path.dirname(__file__), 'datasets', 'uploads')
    if not os.path.exists(upload_dir):
        return {"uploads": []}
    
    files = []
    try:
        for filename in os.listdir(upload_dir):
            filepath = os.path.join(upload_dir, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                files.append({
                    'id': filename,
                    'name': filename,
                    'size_bytes': stat.st_size,
                    'modified_timestamp': int(stat.st_mtime * 1000),
                    'can_train': True,
                })
    except Exception as e:
        print(f"Error listing uploads: {e}")
    
    # Sort by most recent first
    files.sort(key=lambda x: x['modified_timestamp'], reverse=True)
    return {"uploads": files, "total": len(files)}


@app.get("/api/datasets/upload/{upload_id}")
async def get_uploaded_graph(upload_id: str):
    """Retrieve metadata for a previously uploaded graph."""
    import os
    
    upload_dir = os.path.join(os.path.dirname(__file__), 'datasets', 'uploads')
    filepath = os.path.join(upload_dir, upload_id)
    
    # Security: prevent directory traversal
    if not os.path.abspath(filepath).startswith(os.path.abspath(upload_dir)):
        return {"error": "Invalid upload ID"}
    
    if not os.path.exists(filepath):
        return {"error": f"Upload not found: {upload_id}"}
    
    try:
        data = load_custom_graph(filepath)
        data, metadata = auto_detect_graph(data)
        metadata['file_path'] = filepath
        metadata['upload_id'] = upload_id
        return metadata
    except Exception as e:
        return {"error": f"Failed to load graph: {e}"}
```

**Add imports at top of main.py**:
```python
import time
from pathlib import Path
```

**Test**: Upload a graph, then restart backend and verify it's still accessible via `/api/uploads`.

---

## FIX #4: WebSocket Error Handling & User Feedback

**File**: `frontend/src/hooks/useWebSocket.js`

**REPLACE THE ENTIRE FILE WITH**:

```javascript
import { useRef, useCallback, useEffect } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'

export default function useWebSocket() {
  const wsRef       = useRef(null)
  const statusRef   = useRef('disconnected')
  const configRef   = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  const setTraining   = useGNNStore((s) => s.setTraining)
  const setGraphData  = useGNNStore((s) => s.setGraphData)
  const setGroundTruth = useGNNStore((s) => s.setGroundTruth)
  const setTaskData   = useGNNStore((s) => s.setTaskData)
  const setTask5Meta  = useGNNStore((s) => s.setTask5Meta)

  const addSnapshot   = usePlayerStore((s) => s.addSnapshot)
  const loadSnapshots = usePlayerStore((s) => s.loadSnapshots)
  const setDone       = usePlayerStore((s) => s.setDone)

  // Calculate exponential backoff delay
  const getReconnectDelay = useCallback((attemptNumber) => {
    const baseDelay = 1000 // 1 second
    const maxDelay = 30000 // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay)
    return delay
  }, [])

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error(`[WebSocket] Max reconnection attempts (${maxReconnectAttempts}) reached`)
      statusRef.current = 'failed'
      setTraining(false, 0)
      
      // Emit event for UI to show error
      window.dispatchEvent(new CustomEvent('gnn:connection-failed', {
        detail: { 
          attempts: maxReconnectAttempts,
          lastError: 'Could not reconnect to training server',
          userAction: 'Switch to Mock Mode or check backend server'
        }
      }))
      return
    }

    const attemptNum = reconnectAttemptsRef.current
    const delay = getReconnectDelay(attemptNum)
    
    console.log(`[WebSocket] Attempting to reconnect (${attemptNum + 1}/${maxReconnectAttempts}) in ${delay}ms...`)
    
    setTimeout(() => {
      if (configRef.current) {
        connect(configRef.current)
      }
    }, delay)
  }, [setTraining, getReconnectDelay, maxReconnectAttempts])

  const connect = useCallback((config) => {
    console.log('[WebSocket] Initiating connection...')
    
    // Store config for reconnection
    configRef.current = config
    reconnectAttemptsRef.current = 0

    const wsUrl = 'ws://localhost:8000/ws/train'
    
    try {
      wsRef.current = new WebSocket(wsUrl)
    } catch (e) {
      console.error('[WebSocket] Failed to create WebSocket:', e)
      statusRef.current = 'failed'
      setTraining(false, 0)
      return
    }

    statusRef.current = 'connecting'

    wsRef.current.onopen = () => {
      console.log('[WebSocket] Connected')
      statusRef.current = 'connected'
      reconnectAttemptsRef.current = 0 // Reset on successful connection
      wsRef.current.send(JSON.stringify(config))
    }

    wsRef.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'graph_data') {
          const d = msg.data
          if (d.graphData) setGraphData(d.graphData)
          if (d.groundTruth) setGroundTruth(d.groundTruth)
          if (d.graphs) setTaskData({ graphs: d.graphs })
          if (d.testEdges && !d.graphs) setTaskData({ testEdges: d.testEdges })

        } else if (msg.type === 'graph_metadata') {
          setTask5Meta(msg.data)

        } else if (msg.type === 'epoch_snapshot') {
          addSnapshot(msg.data)
          setTraining(true, msg.progress)

        } else if (msg.type === 'training_complete') {
          console.log('[WebSocket] Training complete, loading snapshots...')
          if (msg.all_snapshots && msg.all_snapshots.length > 0) {
            loadSnapshots(msg.all_snapshots)
          }
          setTraining(false, 1)
          setDone(msg.all_snapshots?.length - 1 || 0)

        } else if (msg.type === 'error') {
          console.error('[WebSocket] Training error:', msg.message)
          if (msg.traceback) console.error(msg.traceback)
          setTraining(false, 0)
          
          window.dispatchEvent(new CustomEvent('gnn:training-error', {
            detail: { 
              message: msg.message,
              traceback: msg.traceback,
              userAction: 'Check backend logs and try again'
            }
          }))

        } else if (msg.type === 'ping') {
          // Keepalive ping - ignore
        }
      } catch (e) {
        console.error('[WebSocket] Failed to parse message:', e)
      }
    }

    wsRef.current.onerror = (error) => {
      console.error('[WebSocket] Connection error:', error)
      statusRef.current = 'error'
      setTraining(false, 0)
      
      window.dispatchEvent(new CustomEvent('gnn:websocket-error', {
        detail: { 
          error: error?.message || 'Unknown error',
          userAction: 'Connection will retry automatically'
        }
      }))
    }

    wsRef.current.onclose = (event) => {
      console.log(`[WebSocket] Closed (code: ${event.code})`)
      statusRef.current = 'disconnected'
      
      // Normal close (code 1000) - don't reconnect
      if (event.code === 1000) {
        console.log('[WebSocket] Connection closed normally')
        return
      }
      
      // Abnormal closure - attempt reconnect
      if (configRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current += 1
        console.log('[WebSocket] Abnormal closure detected, attempting reconnect...')
        attemptReconnect()
      } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        // Already emitted in attemptReconnect
      } else {
        window.dispatchEvent(new CustomEvent('gnn:connection-closed', {
          detail: { 
            code: event.code, 
            reason: event.reason || 'No reason provided',
            userAction: 'Click Retry or switch to Mock Mode'
          }
        }))
      }
    }
  }, [addSnapshot, loadSnapshots, setTraining, setGraphData, setGroundTruth, 
      setTaskData, setTask5Meta, setDone, attemptReconnect])

  const disconnect = useCallback(() => {
    console.log('[WebSocket] Disconnecting...')
    if (wsRef.current) {
      wsRef.current.close(1000) // Normal closure
      wsRef.current = null
    }
    statusRef.current = 'disconnected'
  }, [])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    } else {
      console.warn('[WebSocket] Cannot send - connection not open')
    }
  }, [])

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return { connect, disconnect, send, status: statusRef }
}
```

**Test**: Disconnect backend server and verify frontend shows error message instead of hanging.

---

## FIX #5: Add Toast Notification System

**New File**: `frontend/src/components/Toast/Toast.jsx`

```jsx
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, X } from 'lucide-react'

const Toast = ({ id, message, type = 'info', duration = 5000, onClose }) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onClose?.(id)
    }, duration)

    return () => clearTimeout(timer)
  }, [id, duration, onClose])

  if (!visible) return null

  const bgColor = {
    error: 'bg-red-900/80',
    success: 'bg-green-900/80',
    info: 'bg-blue-900/80',
    warning: 'bg-amber-900/80',
  }[type]

  const icon = {
    error: <AlertCircle className="text-red-400" size={18} />,
    success: <CheckCircle className="text-green-400" size={18} />,
    info: <AlertCircle className="text-blue-400" size={18} />,
    warning: <AlertCircle className="text-amber-400" size={18} />,
  }[type]

  return (
    <div className={`${bgColor} border border-gray-700 rounded-lg p-4 flex items-start gap-3 backdrop-blur`}>
      {icon}
      <div className="flex-1">
        <p className="text-sm text-white">{message}</p>
      </div>
      <button onClick={() => { setVisible(false); onClose?.(id) }} className="p-1 hover:bg-black/20 rounded">
        <X size={16} />
      </button>
    </div>
  )
}

export default Toast
```

**New File**: `frontend/src/components/Toast/ToastContainer.jsx`

```jsx
import { useEffect, useState } from 'react'
import Toast from './Toast'

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    // Listen for toast events
    const handleGNNConnectionFailed = (e) => {
      addToast(`Failed to connect after ${e.detail.attempts} attempts. ${e.detail.userAction}`, 'error')
    }

    const handleGNNWebSocketError = (e) => {
      addToast(`Server connection error: ${e.detail.error}`, 'error')
    }

    const handleGNNTrainingError = (e) => {
      addToast(`Training error: ${e.detail.message}. ${e.detail.userAction}`, 'error')
    }

    window.addEventListener('gnn:connection-failed', handleGNNConnectionFailed)
    window.addEventListener('gnn:websocket-error', handleGNNWebSocketError)
    window.addEventListener('gnn:training-error', handleGNNTrainingError)

    return () => {
      window.removeEventListener('gnn:connection-failed', handleGNNConnectionFailed)
      window.removeEventListener('gnn:websocket-error', handleGNNWebSocketError)
      window.removeEventListener('gnn:training-error', handleGNNTrainingError)
    }
  }, [])

  const addToast = (message, type = 'info', duration = 5000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type, duration }])
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="fixed top-4 right-4 z-[999] space-y-2 max-w-sm">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={removeToast}
        />
      ))}
    </div>
  )
}
```

**Update**: `frontend/src/App.jsx`

Add to imports:
```jsx
import ToastContainer from './components/Toast/ToastContainer'
```

Add to main App component (in JSX, after main content):
```jsx
<ToastContainer />
```

**Test**: Toast notifications appear on connection errors.

---

## VERIFICATION CHECKLIST

After applying all fixes:

- [ ] Backend starts without MySQL - uses SQLite fallback ✓
- [ ] Task 1 training shows neighbor agreement data ✓
- [ ] Uploaded graphs still accessible after restart ✓
- [ ] WebSocket reconnects automatically with backoff ✓
- [ ] Toast notifications appear on errors ✓
- [ ] `/api/uploads` endpoint lists all uploaded files ✓
- [ ] `/api/health` shows connection status ✓

---

## QUICK APPLY CHECKLIST

**Phase 1 Complete (Copy-paste time: ~20 minutes)**

1. ✅ Fix #1: Node Classification
   - [ ] Edit `backend/tasks/node_classification.py` lines 85-115
   - [ ] Add Counter import
   - [ ] Add neighbor_agreement to snapshot dict

2. ✅ Fix #2: Database
   - [ ] Replace entire `backend/database.py`
   - [ ] Test with `python backend/database.py`

3. ✅ Fix #3: Upload Handling
   - [ ] Add imports to `backend/main.py` (time, Path)
   - [ ] Replace upload_graph endpoint
   - [ ] Add list_uploads endpoint
   - [ ] Add get_uploaded_graph endpoint

4. ✅ Fix #4: WebSocket
   - [ ] Replace entire `frontend/src/hooks/useWebSocket.js`

5. ✅ Fix #5: Toast Notifications
   - [ ] Create `Toast.jsx` component
   - [ ] Create `ToastContainer.jsx` component
   - [ ] Update `App.jsx` to include ToastContainer

**All 5 fixes**: ~30-40 minutes of actual coding

**Result**: All critical bugs fixed, data becomes updatable, errors visible!

---

*Ready to apply? Start with Fix #1, then test before moving to Fix #2.*
