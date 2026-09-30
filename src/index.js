import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccessGate from './AccessGate';
ReactDOM.createRoot(document.getElementById('root')).render(<AccessGate product="mps"><App /></AccessGate>);
