import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function KnowledgeUpload({ apiBaseUrl }) {
  const [status, setStatus] = useState({ active: false, fileName: null, uploadedAt: null, charCount: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/knowledge/status`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.warn('Could not fetch knowledge status:', err.message);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const uploadFile = async (file) => {
    if (!file) return;

    const allowedExt = /\.(pdf|docx|txt)$/i;
    if (!allowedExt.test(file.name)) {
      setMessage({ type: 'error', text: 'Please upload a PDF, DOCX, or TXT file.' });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('document', file);

      const res = await fetch(`${apiBaseUrl}/api/knowledge/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage({ type: 'error', text: data.error || 'Upload failed.' });
      } else {
        setMessage({ type: 'success', text: `"${data.fileName}" is now active — the AI is using it for every new reply.` });
        setStatus({ active: true, fileName: data.fileName, uploadedAt: data.uploadedAt, charCount: data.charCount });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Upload failed: ${err.message}` });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    uploadFile(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    uploadFile(file);
    e.target.value = '';
  };

  return (
    <div style={{
      backgroundColor: '#ffffff',
      padding: '24px',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
      marginBottom: '24px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <span style={{ fontSize: '20px' }}>📚</span>
        <h3 style={{ margin: 0, color: '#111827', fontSize: '16px', fontWeight: '600' }}>
          Knowledge Document
        </h3>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#4f46e5' : '#d1d5db'}`,
          borderRadius: '10px',
          padding: '28px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragging ? '#eef2ff' : '#f9fafb',
          transition: 'all 0.15s ease'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>{isUploading ? '⏳' : '📄'}</div>
        <div style={{ fontSize: '14px', color: '#374151', fontWeight: '600' }}>
          {isUploading ? 'Processing document...' : 'Drop a PDF, DOCX, or TXT file here, or click to browse'}
        </div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
          This replaces the AI's knowledge immediately for every new reply. Up to 20MB.
        </div>
      </div>

      {message && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '13px',
          backgroundColor: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
        }}>
          {message.text}
        </div>
      )}

      <div style={{ marginTop: '14px', fontSize: '13px', color: '#6b7280' }}>
        {status.active ? (
          <>
            Active document: <strong style={{ color: '#374151' }}>{status.fileName}</strong>
            {' '}({status.charCount.toLocaleString()} characters) — uploaded {new Date(status.uploadedAt).toLocaleString()}.
            <br />
            This stays active for every conversation until a new file is uploaded, or the server restarts.
          </>
        ) : (
          <>No document uploaded yet — the AI has no project-specific facts to draw on until you add one.</>
        )}
      </div>
    </div>
  );
}
