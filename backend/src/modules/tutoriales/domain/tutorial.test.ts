import { describe, expect, it } from 'vitest';
import { TutorialInvalido, parseTutorial, videoIdDe } from './tutorial.js';

const ID = 'dQw4w9WgXcQ';

describe('videoIdDe', () => {
  it('saca el id de los links de YouTube', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `  https://www.youtube.com/live/${ID}  `,
    ]) {
      expect(videoIdDe(link), link).toBe(ID);
    }
  });

  it('rechaza lo que no es un video de YouTube', () => {
    for (const link of [
      '',
      'no es un link',
      `https://vimeo.com/${ID}`,
      `https://youtube.com.evil.example/watch?v=${ID}`,
      `javascript:alert(1)//youtu.be/${ID}`,
      'https://www.youtube.com/watch?v=corto',
      'https://www.youtube.com/@canal',
      `ftp://youtu.be/${ID}`,
    ]) {
      expect(videoIdDe(link), link).toBeNull();
    }
  });
});

describe('parseTutorial', () => {
  it('título recortado y el id del video', () => {
    expect(parseTutorial({ titulo: '  Cómo anotar un fiado ', link: `https://youtu.be/${ID}` })).toEqual(
      { titulo: 'Cómo anotar un fiado', video_id: ID },
    );
  });

  it('sin título, título largo o link que no es de YouTube → TutorialInvalido', () => {
    expect(() => parseTutorial(null)).toThrow(TutorialInvalido);
    expect(() => parseTutorial({ titulo: ' ', link: `https://youtu.be/${ID}` })).toThrow(
      'Poné un título.',
    );
    expect(() => parseTutorial({ titulo: 'x'.repeat(81), link: `https://youtu.be/${ID}` })).toThrow(
      TutorialInvalido,
    );
    expect(() => parseTutorial({ titulo: 'Hola', link: 'https://example.com' })).toThrow(
      'El link tiene que ser de un video de YouTube.',
    );
  });
});
