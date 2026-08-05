import React from 'react';

export default function DashboardShell({ children }) {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {children}
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: '40px 20px',
    backgroundColor: '#f9fafb',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  card: {
    background: '#ffffff',
    padding: '40px',
    borderRadius: '16px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
    border: '1px solid #e5e7eb',
    width: '100%',
    maxWidth: '640px'
  }
};