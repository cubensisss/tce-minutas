'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

type Step = 1 | 2 | 3 | 4 | 5;

type Props = {
  currentStep: Step;
  /**
   * ID do processo para construir os links. Se não vier, é deduzido da
   * URL via useParams (rotas /processo/[id]/...).
   */
  processoId?: string;
};

// Triagem e Resumo apontam para a mesma página (/resumo) — a triagem é
// a extração automática que ALIMENTA o resumo, não é uma rota separada.
// Quando estamos em /novo (sem id ainda), step 1 fica não-clicável.
const STEPS = [
  { num: 1 as const, label: 'Triagem', path: '/resumo' },
  { num: 2 as const, label: 'Resumo', path: '/resumo' },
  { num: 3 as const, label: 'Diretrizes', path: '/diretrizes' },
  { num: 4 as const, label: 'Minuta', path: '/minuta' },
  { num: 5 as const, label: 'Revisão', path: '/revisao' },
];

export default function StepIndicator({ currentStep, processoId }: Props) {
  const params = useParams<{ id?: string }>();
  const id = processoId ?? params?.id;

  return (
    <div className="max-w-3xl mb-12">
      <div className="flex items-center justify-between relative">
        <div className="absolute top-1/2 left-0 w-full h-px bg-outline-variant -z-10" />
        {STEPS.map((step) => {
          const isCompleted = step.num < currentStep;
          const isActive = step.num === currentStep;
          const href = id ? `/processo/${id}${step.path}` : null;

          const dot = (
            <div
              className={`w-4 h-4 rounded-full relative transition-transform ${
                isCompleted
                  ? 'bg-primary ring-4 ring-primary-container/40'
                  : isActive
                  ? 'bg-primary ring-4 ring-primary/30'
                  : 'bg-outline-variant'
              } ${href ? 'group-hover:scale-110' : ''}`}
            >
              {isActive && (
                <div className="absolute inset-0 rounded-full animate-pulse bg-primary opacity-50" />
              )}
            </div>
          );

          const label = (
            <span
              className={`text-[0.6875rem] font-medium transition-colors ${
                isActive
                  ? 'font-bold text-primary'
                  : isCompleted
                  ? 'text-primary'
                  : 'text-outline'
              } ${href ? 'group-hover:text-primary group-hover:underline underline-offset-4' : ''}`}
            >
              {step.label}
            </span>
          );

          const inner = (
            <div
              className="flex flex-col items-center gap-2 bg-background px-4 first:pl-0 first:pr-4 last:pl-4 last:pr-0"
            >
              {dot}
              {label}
            </div>
          );

          return href ? (
            <Link
              key={step.num}
              href={href}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Ir para etapa ${step.num} — ${step.label}`}
              className="group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
            >
              {inner}
            </Link>
          ) : (
            <div key={step.num} aria-current={isActive ? 'step' : undefined}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
