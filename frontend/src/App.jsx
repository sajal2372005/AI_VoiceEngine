import React, { useState, useRef, useEffect } from 'react';
import DashboardShell from './components/DashboardShell.jsx';
import EngineStatus from './components/EngineStatus.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ControlRow from './components/ControlRow.jsx';
import TextEntry from './components/TextEntry.jsx';
import KnowledgeUpload from './components/KnowledgeUpload.jsx';
const SERVER_HOST = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_HOST) || window.location.hostname;
const SERVER_PORT = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_PORT) || '5000';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const HTTP_PROTOCOL = window.location.protocol === 'https:' ? 'https:' : 'http:';
const WS_URL = `${WS_PROTOCOL}//${SERVER_HOST}:${SERVER_PORT}`;
const API_BASE_URL = `${HTTP_PROTOCOL}//${SERVER_HOST}:${SERVER_PORT}`;

function pickSupportedMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return candidates[0];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [statusText, setStatusText] = useState('Disconnected');

  const [config, setConfig] = useState({
    language: 'en-US',
    llmModel: 'gemini-2.5-flash-lite',
    sarvamSpeaker: 'shreya'
  });

  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    if (isConnected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'config_update', config }));
    }
  }, [config, isConnected]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setConfig((currentConfig) => ({
      ...currentConfig,
      [name]: value
    }));
  };

  const processAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;

    try {
      const rawBuffer = audioQueueRef.current.shift();
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(rawBuffer.buffer.slice(rawBuffer.byteOffset, rawBuffer.byteOffset + rawBuffer.byteLength));
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      source.onended = () => {
        isPlayingRef.current = false;
        processAudioQueue();
      };
      source.start(0);
    } catch (err) {
      console.error("Audio chunk playback failed:", err);
      isPlayingRef.current = false;
      processAudioQueue();
    }
  };

  const toggleConnection = () => {
    if (isConnected) {
      if (socketRef.current) socketRef.current.close();
      setIsConnected(false);
      setStatusText('Disconnected');
      return;
    }

    setStatusText('Connecting...');

    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error('Failed to open WebSocket:', err.message);
      setStatusText('Connection failed');
      return;
    }
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setStatusText('Connected & Ready');
      ws.send(JSON.stringify({ type: 'config_update', config }));
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        try {
          const arrayBuffer = await event.data.arrayBuffer();
          audioQueueRef.current.push(new Uint8Array(arrayBuffer));
          processAudioQueue();
        } catch (err) {
          console.error('Failed to read incoming audio blob:', err.message);
        }
      }
    };

    ws.onerror = () => {
      setStatusText('Connection error — check the server is running');
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
      setStatusText('Disconnected');
    };
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedMimeType();
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setIsRecording(false);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
    } catch (err) {
      alert("Microphone hardware access denied: " + err.message);
    }
  };

  const handleSendTextQuery = () => {
    if (!textInput.trim()) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      alert("Please turn on and connect the Voice Engine pipeline first!");
      return;
    }

    const payload = {
      type: 'text_query',
      text: textInput.trim()
    };

    socketRef.current.send(JSON.stringify(payload));
    setTextInput('');
  };

  return (
    <DashboardShell>
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ margin: '0 0 8px 0', color: '#111827', fontSize: '28px', fontWeight: '700', letterSpacing: '-0.02em' }}>
          Voice Engine Dashboard
        </h2>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '15px' }}>Manage your AI pipeline connections and configurations.</p>
      </div>

      <EngineStatus isConnected={isConnected} statusText={statusText} />

      <KnowledgeUpload apiBaseUrl={API_BASE_URL} />

      <SettingsPanel config={config} onChange={handleConfigChange} />

      <ControlRow
        isConnected={isConnected}
        isRecording={isRecording}
        onToggleConnection={toggleConnection}
        onToggleRecording={toggleRecording}
      />

      <div style={{ marginTop: '24px' }}>
        <TextEntry
          isConnected={isConnected}
          textInput={textInput}
          onTextChange={setTextInput}
          onSend={handleSendTextQuery}
        />
      </div>
    </DashboardShell>
  );
}
