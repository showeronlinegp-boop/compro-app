import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { OnboardingAnswers, TierValue, UserProfile } from '../types/api';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

type TierOrPriceDriven = TierValue | 'price_driven';

interface FormState {
  // Step 1
  nombre: string;
  edad: string;
  genero: string;
  // Step 2
  hogar_tamano: number;
  tiene_chicos: boolean;
  tipo_chicos: string[];
  hogar_adultos_mayores: boolean;
  mascotas: string[];
  // Step 3
  pref_almacen_1: TierOrPriceDriven | '';
  pref_lacteos: TierOrPriceDriven | '';
  pref_almacen_2: TierOrPriceDriven | '';
  pref_bebidas: TierOrPriceDriven | '';
  pref_limpieza: TierOrPriceDriven | '';
  pref_personal: TierOrPriceDriven | '';
}

const INITIAL: FormState = {
  nombre: '',
  edad: '',
  genero: '',
  hogar_tamano: 1,
  tiene_chicos: false,
  tipo_chicos: [],
  hogar_adultos_mayores: false,
  mascotas: [],
  pref_almacen_1: '',
  pref_lacteos: '',
  pref_almacen_2: '',
  pref_bebidas: '',
  pref_limpieza: '',
  pref_personal: '',
};

// ─── Chip de selección ────────────────────────────────────────────────────────

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Tarjeta de preferencia de marca ─────────────────────────────────────────

interface BrandCardProps {
  label: string;
  sublabel: string;
  value: TierOrPriceDriven;
  selected: boolean;
  onSelect: () => void;
}

function BrandCard({ label, sublabel, value, selected, onSelect }: BrandCardProps) {
  const isPriceDriven = value === 'price_driven';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 text-center p-3 rounded-2xl border-2 transition-all ${
        selected
          ? isPriceDriven
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-indigo-500 bg-indigo-50'
          : 'border-gray-100 bg-white hover:border-gray-300'
      }`}
    >
      <p className={`text-base font-bold mb-0.5 ${selected ? (isPriceDriven ? 'text-emerald-700' : 'text-indigo-700') : 'text-gray-800'}`}>
        {label}
      </p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </button>
  );
}

// ─── Pregunta de preferencia ──────────────────────────────────────────────────

interface PrefQuestionProps {
  question: string;
  field: keyof Pick<
    FormState,
    | 'pref_almacen_1'
    | 'pref_lacteos'
    | 'pref_almacen_2'
    | 'pref_bebidas'
    | 'pref_limpieza'
    | 'pref_personal'
  >;
  options: Array<{ value: TierOrPriceDriven; label: string; sublabel: string }>;
  form: FormState;
  onChange: (field: keyof FormState, value: TierOrPriceDriven) => void;
}

function PrefQuestion({ question, field, options, form, onChange }: PrefQuestionProps) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-gray-800 mb-2">{question}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <BrandCard
            key={opt.value}
            label={opt.label}
            sublabel={opt.sublabel}
            value={opt.value}
            selected={form[field] === opt.value}
            onSelect={() => onChange(field, opt.value)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1({ form, onChange }: { form: FormState; onChange: (f: keyof FormState, v: string | number) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ¿Cómo te llamás? <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={form.nombre}
          onChange={(e) => onChange('nombre', e.target.value)}
          placeholder="Tu nombre"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Edad (opcional)</label>
        <input
          type="number"
          value={form.edad}
          onChange={(e) => onChange('edad', e.target.value)}
          placeholder="Ej: 32"
          min={1}
          max={120}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Género (opcional)</label>
        <select
          value={form.genero}
          onChange={(e) => onChange('genero', e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">Prefiero no decir</option>
          <option value="femenino">Femenino</option>
          <option value="masculino">Masculino</option>
          <option value="otro">Otro</option>
        </select>
      </div>
    </div>
  );
}

function Step2({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  function toggleArray(field: 'tipo_chicos' | 'mascotas', val: string) {
    setForm((prev) => {
      const arr = prev[field];
      return {
        ...prev,
        [field]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val],
      };
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">¿Cuántas personas viven en tu casa?</p>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip
              key={n}
              active={form.hogar_tamano === n}
              onClick={() => setForm((p) => ({ ...p, hogar_tamano: n }))}
            >
              {n === 5 ? '5+' : String(n)}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">¿Hay chicos en casa?</p>
        <div className="flex gap-2 flex-wrap">
          <Chip
            active={!form.tiene_chicos}
            onClick={() => setForm((p) => ({ ...p, tiene_chicos: false, tipo_chicos: [] }))}
          >
            No
          </Chip>
          <Chip
            active={form.tiene_chicos}
            onClick={() => setForm((p) => ({ ...p, tiene_chicos: true }))}
          >
            Sí
          </Chip>
        </div>
        {form.tiene_chicos && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {[
              { val: 'ninos_3_12', label: 'Chicos (3-12 años)' },
              { val: 'bebes_0_2', label: 'Bebés (0-2 años)' },
            ].map((opt) => (
              <Chip
                key={opt.val}
                active={form.tipo_chicos.includes(opt.val)}
                onClick={() => toggleArray('tipo_chicos', opt.val)}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">¿Hay adultos mayores en casa?</p>
        <div className="flex gap-2">
          <Chip
            active={!form.hogar_adultos_mayores}
            onClick={() => setForm((p) => ({ ...p, hogar_adultos_mayores: false }))}
          >
            No
          </Chip>
          <Chip
            active={form.hogar_adultos_mayores}
            onClick={() => setForm((p) => ({ ...p, hogar_adultos_mayores: true }))}
          >
            Sí
          </Chip>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">¿Tenés mascotas?</p>
        <div className="flex gap-2 flex-wrap">
          <Chip
            active={form.mascotas.length === 0}
            onClick={() => setForm((p) => ({ ...p, mascotas: [] }))}
          >
            No
          </Chip>
          {[
            { val: 'perro', label: '🐶 Perro' },
            { val: 'gato', label: '🐱 Gato' },
          ].map((opt) => (
            <Chip
              key={opt.val}
              active={form.mascotas.includes(opt.val)}
              onClick={() => toggleArray('mascotas', opt.val)}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step3({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  function onChange(field: keyof FormState, value: TierOrPriceDriven) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  const questions: PrefQuestionProps[] = [
    {
      question: '1. Para la yerba mate, ¿con cuál te quedás?',
      field: 'pref_almacen_1',
      options: [
        { value: 1, label: 'Taragüi / Rosamonte', sublabel: 'Primera marca' },
        { value: 2, label: 'Unión / Cruz de Malta', sublabel: 'Segunda marca' },
        { value: 'price_driven', label: 'La que esté más barata', sublabel: 'Me da igual' },
      ],
      form,
      onChange,
    },
    {
      question: '2. Para la leche, ¿con cuál te quedás?',
      field: 'pref_lacteos',
      options: [
        { value: 1, label: 'La Serenísima / Sancor', sublabel: 'Primera marca' },
        { value: 2, label: 'Ilolay / Tregar', sublabel: 'Segunda marca' },
        { value: 'price_driven', label: 'La que esté de oferta', sublabel: 'Me da igual' },
      ],
      form,
      onChange,
    },
    {
      question: '3. Para los fideos y aceite, ¿con cuál te quedás?',
      field: 'pref_almacen_2',
      options: [
        { value: 1, label: 'Matarazzo / Natura', sublabel: 'Primera marca' },
        { value: 2, label: 'Lucchetti / Favorita', sublabel: 'Segunda marca' },
        { value: 'price_driven', label: 'El más barato', sublabel: 'Me da igual' },
      ],
      form,
      onChange,
    },
    {
      question: '4. Para las gaseosas, ¿con cuál te quedás?',
      field: 'pref_bebidas',
      options: [
        { value: 1, label: 'Coca-Cola / Pepsi', sublabel: 'Primera marca' },
        { value: 2, label: 'Pritty / Baggio', sublabel: 'Segunda marca' },
        { value: 'price_driven', label: 'La que esté de oferta', sublabel: 'Me da igual' },
      ],
      form,
      onChange,
    },
    {
      question: '5. Para el jabón de ropa, ¿con cuál te quedás?',
      field: 'pref_limpieza',
      options: [
        { value: 1, label: 'Skip / Ariel / Ala', sublabel: 'Primera marca' },
        { value: 2, label: 'Querubín / Zorro', sublabel: 'Segunda marca' },
        { value: 'price_driven', label: 'La más barata', sublabel: 'Me da igual' },
      ],
      form,
      onChange,
    },
    {
      question: '6. Para el shampoo, ¿con cuál te quedás?',
      field: 'pref_personal',
      options: [
        { value: 1, label: 'Sedal / Pantene / Dove', sublabel: 'Primera marca' },
        { value: 2, label: 'Plusbelle / Tío Nacho', sublabel: 'Segunda marca' },
        { value: 'price_driven', label: 'El más barato', sublabel: 'Me da igual' },
      ],
      form,
      onChange,
    },
  ];

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-xl p-3">
        Estas preferencias nos ayudan a armar tu lista inicial. Las podés cambiar en cualquier momento.
      </p>
      {questions.map((q) => (
        <PrefQuestion key={q.field} {...q} />
      ))}
    </div>
  );
}

function Step4({ form, generated }: { form: FormState; generated: number }) {
  const perfilLabels: Record<string, string> = {
    joven_solo: 'Joven solo/a',
    pareja: 'Pareja',
    familia_con_ninos: 'Familia con chicos',
    adultos_mayores: 'Adultos mayores',
  };

  const hogar = (() => {
    if (form.hogar_tamano === 1) return 'joven_solo';
    if (form.hogar_adultos_mayores && form.tipo_chicos.length === 0) return 'adultos_mayores';
    if (form.tipo_chicos.length > 0 || form.hogar_tamano >= 3) return 'familia_con_ninos';
    return 'pareja';
  })();

  return (
    <div className="text-center space-y-4">
      <div className="text-5xl mb-2">🎉</div>
      <h3 className="text-lg font-bold text-gray-900">¡Listo, {form.nombre}!</h3>
      <p className="text-sm text-gray-600">
        Perfil:{' '}
        <span className="font-semibold text-indigo-700">{perfilLabels[hogar] ?? hogar}</span>
      </p>
      {generated > 0 ? (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <p className="text-sm font-semibold text-indigo-800">
            Generamos {generated} producto{generated !== 1 ? 's' : ''} en tu lista de compras
          </p>
          <p className="text-xs text-indigo-600 mt-1">
            Los encontrás en el Planner. Podés agregar, quitar o cambiar frecuencias cuando quieras.
          </p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-800">
            No encontramos productos con precios disponibles todavía
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Sincronizá los supers primero desde el menú de Sync, después generá la lista desde tu perfil.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Wizard principal ─────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: OnboardingProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(0);
  const [done, setDone] = useState(false);

  const STEPS = [
    { title: 'Tus datos', emoji: '👤' },
    { title: 'Tu hogar', emoji: '🏠' },
    { title: 'Tus gustos', emoji: '🛍️' },
    { title: '¡Listo!', emoji: '🎉' },
  ];

  function canNext(): boolean {
    if (step === 0) return form.nombre.trim().length > 0;
    if (step === 1) return true;
    if (step === 2) {
      return (
        form.pref_almacen_1 !== '' &&
        form.pref_lacteos !== '' &&
        form.pref_almacen_2 !== '' &&
        form.pref_bebidas !== '' &&
        form.pref_limpieza !== '' &&
        form.pref_personal !== ''
      );
    }
    return true;
  }

  async function handleNext() {
    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }

    // Step 2 → submit onboarding
    setLoading(true);
    setError('');
    try {
      const answers: OnboardingAnswers = {
        nombre: form.nombre.trim(),
        edad: form.edad ? Number(form.edad) : undefined,
        genero: form.genero || undefined,
        hogar_tamano: form.hogar_tamano,
        hogar_chicos: form.tipo_chicos,
        hogar_adultos_mayores: form.hogar_adultos_mayores,
        hogar_mascotas: form.mascotas,
        pref_almacen_1: form.pref_almacen_1 as TierOrPriceDriven,
        pref_lacteos: form.pref_lacteos as TierOrPriceDriven,
        pref_almacen_2: form.pref_almacen_2 as TierOrPriceDriven,
        pref_bebidas: form.pref_bebidas as TierOrPriceDriven,
        pref_limpieza: form.pref_limpieza as TierOrPriceDriven,
        pref_personal: form.pref_personal as TierOrPriceDriven,
      };
      const { profile, generated: gen } = await api.profile.onboarding(answers);
      setGenerated(gen);
      setDone(true);
      setStep(3);
      onComplete(profile);
    } catch (e) {
      setError('Ocurrió un error al guardar el perfil. Intentá de nuevo.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleFinish() {
    navigate('/planner');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-lg p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <span className="text-3xl">{STEPS[step]?.emoji}</span>
          <h2 className="text-xl font-bold text-gray-900 mt-2">{STEPS[step]?.title}</h2>
          {step === 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Contanos un poco sobre vos para armar tu lista personalizada
            </p>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.slice(0, 3).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? 'w-6 bg-indigo-600'
                  : i < step
                    ? 'w-3 bg-indigo-300'
                    : 'w-3 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="mb-6">
          {step === 0 && (
            <Step1
              form={form}
              onChange={(f, v) => setForm((p) => ({ ...p, [f]: v }))}
            />
          )}
          {step === 1 && <Step2 form={form} setForm={setForm} />}
          {step === 2 && <Step3 form={form} setForm={setForm} />}
          {step === 3 && done && <Step4 form={form} generated={generated} />}
        </div>

        {error && (
          <p className="text-sm text-red-500 text-center mb-4">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {step > 0 && step < 3 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Atrás
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canNext() || loading}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Guardando…' : step === 2 ? 'Crear mi lista' : 'Siguiente'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Ver mi lista →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
