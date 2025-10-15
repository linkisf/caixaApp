import React from "react";
import Modal from "./Modal";

type Props = {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export default function ConfirmDialog({
  open,
  title = "Confirmar",
  message = "Tem certeza?",
  confirmText = "Excluir",
  cancelText = "Cancelar",
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm">
      <div style={{ paddingBottom: 8 }}>{message}</div>
      <div className="modal-footer" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onClose}>{cancelText}</button>
        <button type="button" className="btn danger" onClick={onConfirm}>{confirmText}</button>
      </div>
    </Modal>
  );
}
