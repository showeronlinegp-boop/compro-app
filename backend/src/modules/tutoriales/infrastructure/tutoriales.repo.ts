import type { PrismaClient } from '@prisma/client';
import type { TutorialInput } from '../domain/tutorial.js';

type PrismaLike = Pick<PrismaClient, 'tutoriales'>;

export interface TutorialView {
  id: number;
  titulo: string;
  video_id: string;
}

export interface TutorialesRepo {
  /** Todos, en el orden en que se cargaron. */
  listar(): Promise<TutorialView[]>;
  crear(input: TutorialInput): Promise<TutorialView>;
  /** false si no existía. */
  borrar(id: number): Promise<boolean>;
}

const CAMPOS = { id: true, titulo: true, video_id: true } as const;

/** Los tutoriales son de toda la app (no de un comercio): sin user_id. */
export function makeTutorialesRepo(prisma: PrismaLike): TutorialesRepo {
  return {
    listar: () => prisma.tutoriales.findMany({ select: CAMPOS, orderBy: { id: 'asc' } }),
    crear: (input) => prisma.tutoriales.create({ data: input, select: CAMPOS }),
    async borrar(id) {
      const { count } = await prisma.tutoriales.deleteMany({ where: { id } });
      return count > 0;
    },
  };
}
