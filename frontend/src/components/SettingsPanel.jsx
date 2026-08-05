import React from 'react';

export default function SettingsPanel({ config, onChange }) {
  const labelStyle = {
    display: 'block', 
    fontSize: '12px', 
    fontWeight: '600', 
    color: '#6b7280', 
    textTransform: 'uppercase', 
    letterSpacing: '0.05em', 
    marginBottom: '8px'
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
        <span style={{ fontSize: '20px' }}>⚙️</span>
        <h3 style={{ margin: 0, color: '#111827', fontSize: '16px', fontWeight: '600' }}>
          Engine Configuration
        </h3>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Language</label>
          <select name="language" value={config.language} onChange={onChange} style={selectStyle}>
            <option value="en-US">English (US)</option>
            <option value="hi-IN">Hindi (India)</option>
            <option value="gu-IN">Gujarati (India)</option>
          </select>
        </div>
        
        
        <div>
          <label style={labelStyle}>Brain (LLM)</label>
          <select name="llmModel" value={config.llmModel} onChange={onChange} style={selectStyle}>
            <optgroup label="Google Gemini">
              <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            </optgroup>
          </select>
        </div>

        
        <div>
          <label style={labelStyle}>Sarvam Voice</label>
          <select name="sarvamSpeaker" value={config.sarvamSpeaker} onChange={onChange} style={selectStyle}>
            <optgroup label="Female Voices">
              <option value="shreya">Shreya (Default)</option>
              <option value="ritu">Ritu</option>
              <option value="priya">Priya</option>
              <option value="neha">Neha</option>
              <option value="pooja">Pooja</option>
              <option value="simran">Simran</option>
              <option value="kavya">Kavya</option>
              <option value="ishita">Ishita (Dynamic)</option>
              <option value="roopa">Roopa</option>
              <option value="amelia">Amelia</option>
              <option value="sophia">Sophia</option>
            </optgroup>
            
            <optgroup label="Male Voices">
              <option value="aditya">Aditya</option>
              <option value="shubh">Shubh (Friendly)</option>
              <option value="manan">Manan (Consistent)</option>
              <option value="rahul">Rahul</option>
              <option value="rohan">Rohan</option>
              <option value="amit">Amit</option>
              <option value="dev">Dev</option>
              <option value="ratan">Ratan</option>
              <option value="varun">Varun</option>
              <option value="sumit">Sumit</option>
              <option value="kabir">Kabir</option>
              <option value="aayan">Aayan</option>
              <option value="ashutosh">Ashutosh</option>
              <option value="advait">Advait</option>
            </optgroup>
          </select>
        </div>
        
      </div>
    </div>
  );
}

const selectStyle = {
  width: '100%', 
  padding: '10px 12px', 
  borderRadius: '8px', 
  border: '1px solid #d1d5db', 
  fontSize: '14px', 
  color: '#374151', 
  backgroundColor: '#f9fafb', 
  cursor: 'pointer', 
  outline: 'none'
};