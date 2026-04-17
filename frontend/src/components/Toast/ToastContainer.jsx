import React from 'react';
import { useToast } from './ToastContext';
import ToastItem from './ToastItem';
import './ToastStyles.css';

const ToastContainer = () => {
  const { toasts } = useToast();

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} />
      ))}
    </div>
  );
};

export default ToastContainer;
