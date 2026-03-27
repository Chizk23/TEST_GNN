import { useRef, useCallback, useEffect } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'

export default function useWebSocket() {
  const wsRef       = useRef(null)
  const statusRef   = useRef('disconnected')

  const setTraining   = useGNNStore((s) => s.setTraining)
  const setGraphData  = useGNNStore((s) => s.setGraphData)
  const setGroundTruth = useGNNStore((s) => s.setGroundTruth)
  const setTaskData   = useGNNStore((s) => s.setTaskData)
  
  const addSnapshot   = usePlayerStore((s) => s.addSnapshot)
  const loadSnapshots = usePlayerStore((s) => s.loadSnapshots)
  const setDone       = usePlayerStore((s) => s.setDone)

  const connect = useCallback((config) => {
    const wsUrl = 'ws://localhost:8000/ws/train'
    wsRef.current = new WebSocket(wsUrl)
    statusRef.current = 'connecting'

    wsRef.current.onopen = () => {
      statusRef.current = 'connected'
      wsRef.current.send(JSON.stringify(config))
    }

    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === 'graph_data') {
        const d = msg.data

        // Always update primary graph data and ground truth if they exist in the message
        if (d.graphData) {
          setGraphData(d.graphData)
        }
        if (d.groundTruth) {
          setGroundTruth(d.groundTruth)
        }
        
        // Task-specific data
        if (d.graphs) {
          setTaskData({ graphs: d.graphs })
        }
        if (d.testEdges && !d.graphs) {
          setTaskData({ testEdges: d.testEdges })
        }

      } else if (msg.type === 'epoch_snapshot') {
        addSnapshot(msg.data)
        setTraining(true, msg.progress)

      } else if (msg.type === 'training_complete') {
        loadSnapshots(msg.all_snapshots)
        setTraining(false, 1)
        setDone(msg.all_snapshots.length - 1)

      } else if (msg.type === 'error') {
        console.error('Training error:', msg.message)
        console.error(msg.traceback)
        setTraining(false, 0)

      } else if (msg.type === 'ping') {
        // Keepalive, ignore
      }
    }

    wsRef.current.onerror = () => {
      statusRef.current = 'disconnected'
      setTraining(false, 0)
    }

    wsRef.current.onclose = () => {
      statusRef.current = 'disconnected'
    }
  }, [addSnapshot, loadSnapshots, setTraining, setGraphData, setGroundTruth, setTaskData, setDone])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    statusRef.current = 'disconnected'
  }, [])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return { connect, disconnect, send, status: statusRef }
}
