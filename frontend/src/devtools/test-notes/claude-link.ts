/**
 * Link que abre Windows Terminal con Claude Code trabajando la nota, registrado
 * por `tools/claude-link/registrar.ps1`. Solo viaja el número: el pedido a
 * Claude es fijo y lo arma `abrir-nota.ps1`.
 */
export function claudeLink(id: number): string {
  if (!Number.isInteger(id) || id <= 0) throw new Error(`id de nota inválido: ${id}`);
  return `compro-claude://nota/${id}`;
}

/** Abre el link (el navegador pregunta la primera vez si permite abrirlo). */
export function enviarAClaude(id: number): void {
  window.location.assign(claudeLink(id));
}
