import React from 'react';

export default function ControlRow({
  isConnected,
  isRecording,
  onToggleConnection,
  onToggleRecording
}) {
  return (
    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
      
      <button
        onClick={onToggleConnection}
        style={{
          flex: 1,
          padding: '14px 20px',
          borderRadius: '10px',
          border: 'none',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '15px',
          backgroundColor: isConnected ? '#fef2f2' : '#10b981',
          color: isConnected ? '#dc2626' : '#ffffff',
          boxShadow: isConnected ? 'inset 0 0 0 1px #fca5a5' : '0 4px 6px -1px rgba(16, 185, 129, 0.3)',
          transition: 'all 0.2s ease',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        {isConnected ? '⏹ Disconnect' : '▶ Connect Engine'}
      </button>

      <button
        onClick={onToggleRecording}
        disabled={!isConnected}
        style={{
          flex: 1,
          padding: '14px 20px',
          borderRadius: '10px',
          border: 'none',
          cursor: isConnected ? 'pointer' : 'not-allowed',
          fontWeight: '600',
          fontSize: '15px',
          backgroundColor: isRecording ? '#fff7ed' : (isConnected ? '#4f46e5' : '#f3f4f6'),
          color: isRecording ? '#ea580c' : (isConnected ? '#ffffff' : '#9ca3af'),
          boxShadow: isRecording 
            ? 'inset 0 0 0 1px #fdba74' 
            : (isConnected ? '0 4px 6px -1px rgba(79, 70, 229, 0.3)' : 'none'),
          transition: 'all 0.2s ease',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        {isRecording ? '⏸ Stop Listening' : '🎙️ Talk via Mic'}
      </button>

    </div>
  );
}