import { useRef, useCallback, useEffect } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import { useToast } from '../components/Toast'

export default function useWebSocket() {
  const wsRef       = useRef(null)
  const statusRef   = useRef('disconnected')
  const configRef   = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  const { error: showError, success: showSuccess, warning: showWarning } = useToast()

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
      showSuccess('Connected to training server', 3000)
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
          showError(`Training Error: ${msg.message}`, 6000)
          
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
      showError('WebSocket connection error. Retrying...', 5000)
      
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
      setTaskData, setTask5Meta, setDone, attemptReconnect, showSuccess, showError])

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
