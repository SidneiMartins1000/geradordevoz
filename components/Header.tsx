
import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="text-center">
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-red-500">
        Gerador de Voz Profissional
      </h1>
      <p className="mt-2 text-lg text-gray-400 max-w-2xl mx-auto">
        Gere e baixe múltiplas narrações de uma só vez.
      </p>
        <p className="mt-2 text-lg text-gray-400 max-w-2xl mx-auto">
        Desenvolvido por Sidnei Martins
      </p>
    </header>
  );
};
