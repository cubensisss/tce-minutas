'use client';

export default function StepIndicator({ currentStep = 1 }) {
  const steps = [
    { num: 1, label: 'Triagem' },
    { num: 2, label: 'Resumo' },
    { num: 3, label: 'Diretrizes' },
    { num: 4, label: 'Minuta' },
    { num: 5, label: 'Revisão' },
  ];

  return (
    <div className="max-w-3xl mb-12">
      <div className="flex items-center justify-between relative">
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-outline-variant -z-10"></div>
        {steps.map((step) => {
          const isCompleted = step.num < currentStep;
          const isActive = step.num === currentStep;
          const isPending = step.num > currentStep;

          return (
            <div key={step.num} className="flex flex-col items-center gap-2 bg-background px-4 first:pl-0 first:pr-4 last:pl-4 last:pr-0">
              <div className={`w-4 h-4 rounded-full relative ${
                isCompleted ? 'bg-primary ring-4 ring-primary-container/20' :
                isActive ? 'bg-primary ring-4 ring-primary/30' :
                'bg-outline-variant'
              }`}>
                {isActive && (
                  <div className="absolute inset-0 rounded-full animate-pulse bg-surface-tint opacity-50"></div>
                )}
              </div>
              <span className={`text-[0.6875rem] font-medium ${
                isActive ? 'font-bold text-primary' :
                isCompleted ? 'text-primary' :
                'text-outline'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
