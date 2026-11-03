import { supabase } from './supabase';

// Renderiza una carta como imagen pergamino (1080x1350, ideal para WhatsApp).
export function renderParchment(title: string, body: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const W = 1080;
      const H = 1350;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('sin lienzo');
      // Fondo pergamino degradado.
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#F7EFD8');
      bg.addColorStop(0.5, '#F3E6C8');
      bg.addColorStop(1, '#EAD9B5');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // Marco dorado doble.
      ctx.strokeStyle = '#C9A227';
      ctx.lineWidth = 6;
      ctx.strokeRect(36, 36, W - 72, H - 72);
      ctx.lineWidth = 2;
      ctx.strokeRect(58, 58, W - 116, H - 116);
      // Marca superior.
      ctx.fillStyle = '#8a6d1c';
      ctx.font = '600 30px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('E - T E R N A L', W / 2, 150);
      // Título centrado.
      ctx.fillStyle = '#2C241E';
      ctx.font = 'bold 52px Georgia, serif';
      wrapCenter(ctx, title || 'Carta', W / 2, 235, W - 220, 64);
      // Cuerpo justificado a la izquierda.
      ctx.textAlign = 'left';
      ctx.fillStyle = '#3E362C';
      ctx.font = '30px Georgia, serif';
      wrapLeft(ctx, body || '', 130, 360, W - 260, 46, H - 240);
      // Pie.
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8a6d1c';
      ctx.font = 'italic 30px Georgia, serif';
      ctx.fillText('Con todo mi amor', W / 2, H - 140);
      ctx.fillStyle = '#6B625B';
      ctx.font = '24px Georgia, serif';
      ctx.fillText('E-ternal · Bóveda Digital', W / 2, H - 95);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('no se pudo crear la imagen'));
      }, 'image/jpeg', 0.88);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('no se pudo crear la imagen'));
    }
  });
}

function wrapCenter(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lh: number
): void {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = t;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
}

function wrapLeft(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  maxY: number
): void {
  const paras = text.split(/\n+/);
  let cy = y;
  for (const p of paras) {
    const words = p.split(/\s+/).filter(Boolean);
    let line = '';
    const flush = () => {
      if (!line) return;
      if (cy > maxY) {
        line = '';
        return;
      }
      ctx.fillText(line, x, cy);
      cy += lh;
      line = '';
    };
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        flush();
        line = w;
      } else {
        line = t;
      }
    }
    flush();
    cy += lh * 0.4;
    if (cy > maxY) break;
  }
}

// Sube el pergamino a la bóveda privada y devuelve enlace firmado (7 días).
export async function uploadParchment(memoryId: string, blob: Blob): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Tu sesión expiró. Ingresa nuevamente.');
  const path = `${user.id}/parchment/${memoryId}.jpg`;
  const { error: upErr } = await supabase.storage.from('vault').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await supabase.storage.from('vault').createSignedUrl(path, 604800);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'sin URL firmada');
  return data.signedUrl;
}
