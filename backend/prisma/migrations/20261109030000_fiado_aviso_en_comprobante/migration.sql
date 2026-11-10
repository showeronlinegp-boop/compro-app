-- El aviso de condiciones de recargo también puede ir dentro del comprobante de
-- un fiado ('comprobante'): ya no hace falta avisar antes de anotarle.
ALTER TABLE "fiado_avisos_recargo" DROP CONSTRAINT "fiado_avisos_recargo_via_check";
ALTER TABLE "fiado_avisos_recargo" ADD CONSTRAINT "fiado_avisos_recargo_via_check"
  CHECK ("via" IN ('whatsapp', 'informado', 'comprobante'));
