import React from "react";

export type LabeledInputProps = {
  label: string;
  value: any;
  onChange?: (v: any) => void;
  suffix?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
};

export const LabeledInput: React.FC<LabeledInputProps> = ({
  label,
  value,
  onChange,
  suffix,
  type = "text",
  className = "",
  ...rest
}) => (
  <label className="block text-sm">
    <span className="text-slate-600">{label}</span>
    <div className="mt-1 flex items-center gap-2">
      <input
        type={type}
        className={`w-full px-3 py-1.5 rounded-lg border border-slate-300 ${className}`}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
      {suffix ? <span className="text-slate-500">{suffix}</span> : null}
    </div>
  </label>
);
