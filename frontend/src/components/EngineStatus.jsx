import React from 'react';

export default function EngineStatus({ isConnected, statusText }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 16px',
      borderRadius: '9999px',
      backgroundColor: isConnected ? '#ecfdf5' : '#fef2f2',
      border: `1px solid ${isConnected ? '#a7f3d0' : '#fecaca'}`,
      color: isConnected ? '#065f46' : '#991b1b',
      fontWeight: '600',
      marginBottom: '24px',
      fontSize: '14px',
      letterSpacing: '0.02em'
    }}>
      <span style={{ 
        width: '8px', 
        height: '8px', 
        borderRadius: '50%', 
        backgroundColor: isConnected ? '#10b981' : '#ef4444',
        boxShadow: isConnected ? '0 0 8px rgba(16, 185, 129, 0.8)' : '0 0 8px rgba(239, 68, 68, 0.8)'
      }}></span>
      {statusText}
    </div>
  );
}