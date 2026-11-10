-- Tutoriales en video (YouTube) que carga el admin y ven todos los comercios en Ajustes.
-- Sólo el id del video: el link se arma en el front.
CREATE TABLE "tutoriales" (
  "id" SERIAL PRIMARY KEY,
  "titulo" VARCHAR(80) NOT NULL,
  "video_id" VARCHAR(11) NOT NULL CHECK ("video_id" ~ '^[A-Za-z0-9_-]{11}$'),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
