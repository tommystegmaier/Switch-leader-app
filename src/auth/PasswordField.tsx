import { useState } from 'react';

/**
 * A password input with a "show/hide" toggle so people can check what they're
 * typing. Behaves like a plain controlled input otherwise.
 */
export function PasswordField({
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength = 6,
  required = true,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 pr-16 focus:outline-none focus-visible:ring-2"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-2 my-auto h-fit rounded px-2 py-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
