'use client';
import { useEffect,useRef } from 'react';
import Icon from './Icon';

export default function Modal({ title,onClose,children,wide=false }: {title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ const dialog=ref.current;dialog?.showModal();return ()=>dialog?.close(); },[]);
  return <dialog ref={ref} className={`modal ${wide?'modal-wide':''}`} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}} aria-label={title}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><Icon name="close"/></button></div>
    <div className="modal-body">{children}</div>
  </dialog>;
}
