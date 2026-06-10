import React from 'react';
import { PRODUCT_TEXT_VARIABLES } from '../constants/productTextVariables';

type ProductTextVariablesHelpProps = {
  className?: string;
};

export function ProductTextVariablesHelp({ className }: ProductTextVariablesHelpProps) {
  return (
    <div
      className={className}
      style={{
        marginTop: '0.5rem',
        padding: '0.75rem 0.9rem',
        borderRadius: '0.5rem',
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        fontSize: '0.82rem',
        color: '#475569',
        lineHeight: 1.45,
      }}
    >
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600, color: '#334155' }}>
        Variables dynamiques (Paramètres plateforme)
      </p>
      <p style={{ margin: '0 0 0.6rem' }}>
        Utilisez ces variables dans la description et les CGV. Elles sont remplacées automatiquement à
        l&apos;affichage selon les informations renseignées dans Paramètres.
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.35rem 0.5rem',
        }}
      >
        {PRODUCT_TEXT_VARIABLES.map((variable) => (
          <code
            key={variable.key}
            title={variable.label}
            style={{
              padding: '0.15rem 0.4rem',
              borderRadius: '0.35rem',
              background: '#fff',
              border: '1px solid #cbd5e1',
              fontSize: '0.78rem',
              color: '#0f172a',
              whiteSpace: 'nowrap',
            }}
          >
            {variable.token}
          </code>
        ))}
      </div>
    </div>
  );
}

export default ProductTextVariablesHelp;
