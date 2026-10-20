import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icons.jsx';
import PlanUsage from './PlanUsage.jsx';

export default function ChatComposer({ usage, busy, message, setMessage, maxTime, setMaxTime, generate, onImport, compact }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const trigger = useRef(null), panel = useRef(null), input = useRef(null);
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus(); };
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(100, Math.max(44, element.scrollHeight))}px`;
  }, [message, compact]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = Math.min(280, (viewport?.width || window.innerWidth) - 24);
      const leftEdge = viewport?.offsetLeft || 0;
      setPosition({ width, left: Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + (viewport?.width || window.innerWidth) - width - 12)),
        bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(80, rect.top - (viewport?.offsetTop || 0) - 20) });
    };
    place();
    const outside = event => { if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(); };
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); close(true); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => panel.current?.querySelector('button')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => { if (busy) setOpen(false); }, [busy]);
  const importFood = mode => { close(); onImport(mode); };
  return <>
    <div className="chat-composer-topline">
      <div className="culinary-suggestions">
        <span><Icon name="sun" size={14} />SUGERENCIAS</span>
        <button disabled={busy} onClick={() => generate('¿Qué puedo cocinar con lo que tengo?')}>🍽️ Una idea para hoy</button>
        <button disabled={busy} onClick={() => generate('Sugiere una receta rápida con mi despensa')}>⚡ Algo rápido</button>
        <button disabled={busy} onClick={() => generate('Quiero aprovechar mis vegetales')}>🌱 Mis vegetales</button>
      </div>
      <PlanUsage usage={usage} compact />
    </div>
    <form className="culinary-composer compact-composer" onSubmit={event => {
      event.preventDefault(); if (message.trim() && !busy) generate(message.trim());
    }}>
      <button ref={trigger} type="button" className="chat-options-toggle" aria-label="Opciones del mensaje" title="Foto, alimentos y tiempo para cocinar"
        aria-expanded={open} aria-controls="chat-compose-options" aria-haspopup="dialog" disabled={busy} onClick={() => setOpen(value => !value)}>
        <Icon name="plus" size={23} />
      </button>
      <textarea ref={input} aria-label="Mensaje para Nutribot" placeholder={compact ? '¿Qué cocinamos hoy?' : 'Escribe lo que tienes en mente… ¿qué cocinamos hoy?'}
        value={message} maxLength={500} rows={1} disabled={busy} onChange={event => setMessage(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault(); if (message.trim() && !busy) generate(message.trim());
          }
        }} />
      <button className="culinary-send" type="submit" aria-label="Enviar mensaje" disabled={busy || !message.trim()}><Icon name="send" size={20} /></button>
    </form>
    {open && createPortal(<div ref={panel} id="chat-compose-options" className="chat-compose-popover" role="dialog" aria-label="Opciones del mensaje"
      style={position || {visibility:'hidden'}} onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close();
      }}>
      <button type="button" onClick={() => importFood('image')}><Icon name="camera" size={20} /><span>Usar Nutri-Vision<small>Subir o tomar una foto</small></span></button>
      <button type="button" onClick={() => importFood('text')}><Icon name="plus" size={20} /><span>Agregar alimentos<small>Escribir manualmente</small></span></button>
      <label className="chat-cooking-time"><span><Icon name="clock" size={18} />Tiempo para cocinar</span>
        <select aria-label="Tiempo máximo para preparar la receta" value={maxTime} onChange={event => { setMaxTime(Number(event.target.value)); close(true); }}>
          <option value={15}>Hasta 15 minutos</option><option value={30}>Hasta 30 minutos</option><option value={60}>Hasta 60 minutos</option>
        </select>
      </label>
    </div>, document.body)}
  </>;
}
