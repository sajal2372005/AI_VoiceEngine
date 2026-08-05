import React from 'react';

export default function TextEntry({
  isConnected,
  textInput,
  onTextChange,
  onSend
}) {
  const canSend = isConnected && textInput.trim().length > 0;

  return (
    <div style={{ 
      backgroundColor: '#ffffff', 
      padding: '24px', 
      borderRadius: '12px', 
      border: '1px solid #e5e7eb',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' 
    }}>
      <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '15px', fontWeight: '600' }}>
        Direct Text Entry <span style={{ fontWeight: '400', color: '#9ca3af', fontSize: '13px' }}>(Bypasses Mic)</span>
      </h4>
      
      <div style={{ display: 'flex', gap: '12px' }}>
        <input
          type="text"
          value={textInput}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          disabled={!isConnected}
          placeholder={isConnected ? 'Type a message to the AI here...' : 'Waiting for connection...'}
          style={{
            flex: 1,
            padding: '14px 16px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '15px',
            outline: 'none',
            backgroundColor: isConnected ? '#ffffff' : '#f3f4f6',
            color: '#111827',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
            transition: 'border-color 0.2s ease'
          }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          style={{
            padding: '0 24px',
            borderRadius: '8px',
            background: canSend ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : '#d1d5db',
            color: 'white',
            border: 'none',
            cursor: canSend ? 'pointer' : 'not-allowed',
            fontSize: '15px',
            fontWeight: '600',
            letterSpacing: '0.02em',
            transition: 'all 0.2s ease',
            boxShadow: canSend ? '0 4px 6px -1px rgba(99, 102, 241, 0.4)' : 'none'
          }}
        >
          Ask & Listen
        </button>
      </div>
    </div>
  );
}