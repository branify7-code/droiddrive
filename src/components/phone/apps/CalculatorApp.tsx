"use client";

import { useState } from "react";
import { Delete } from "lucide-react";

type Op = "+" | "-" | "×" | "÷" | null;

export default function CalculatorApp() {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [history, setHistory] = useState<string>("");

  const inputDigit = (d: string) => {
    if (overwrite) {
      setDisplay(d === "." ? "0." : d);
      setOverwrite(false);
    } else {
      if (d === "." && display.includes(".")) return;
      if (display.replace("-", "").replace(".", "").length >= 12) return;
      setDisplay(display === "0" && d !== "." ? d : display + d);
    }
  };

  const compute = (a: number, b: number, o: Op): number => {
    switch (o) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b === 0 ? NaN : a / b;
      default: return b;
    }
  };

  const fmt = (n: number): string => {
    if (!isFinite(n) || isNaN(n)) return "Error";
    const s = Number(n.toPrecision(12));
    if (Math.abs(s) >= 1e12 || (Math.abs(s) < 1e-9 && s !== 0)) return s.toExponential(6);
    return String(s);
  };

  const setOperator = (o: Op) => {
    const cur = parseFloat(display);
    if (acc !== null && op && !overwrite) {
      const r = compute(acc, cur, op);
      setAcc(r);
      setDisplay(fmt(r));
      setHistory(`${fmt(r)} ${o ?? ""}`);
    } else {
      setAcc(cur);
      setHistory(`${fmt(cur)} ${o ?? ""}`);
    }
    setOp(o);
    setOverwrite(true);
  };

  const equals = () => {
    if (acc === null || !op) return;
    const cur = parseFloat(display);
    const r = compute(acc, cur, op);
    setHistory(`${fmt(acc)} ${op} ${fmt(cur)} =`);
    setDisplay(fmt(r));
    setAcc(null);
    setOp(null);
    setOverwrite(true);
  };

  const clearAll = () => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setOverwrite(true);
    setHistory("");
  };

  const backspace = () => {
    if (overwrite) return;
    setDisplay(display.length <= 1 || (display.length === 2 && display.startsWith("-")) ? "0" : display.slice(0, -1));
  };

  const Btn = ({
    label,
    onClick,
    variant = "num",
    className = "",
    icon,
  }: {
    label: string;
    onClick: () => void;
    variant?: "num" | "op" | "fn" | "eq";
    className?: string;
    icon?: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className={`flex h-[52px] items-center justify-center rounded-2xl text-lg font-medium transition active:scale-95 ${
        variant === "num"
          ? "bg-white/[0.09] text-white hover:bg-white/[0.14]"
          : variant === "op"
            ? "bg-emerald-500/85 text-white hover:bg-emerald-500"
            : variant === "eq"
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
              : "bg-white/[0.05] text-emerald-300 hover:bg-white/10"
      } ${className}`}
    >
      {icon ?? label}
    </button>
  );

  return (
    <div className="flex h-full flex-col px-4 pb-16 pt-12">
      <div className="mb-4 mt-2 flex flex-1 flex-col items-end justify-end px-1">
        <p className="h-4 text-[11px] text-white/35">{history}</p>
        <p className="mt-1 truncate text-[44px] font-light leading-tight text-white">{display}</p>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        <Btn label="C" variant="fn" onClick={clearAll} />
        <Btn label="÷" variant="fn" onClick={() => setOperator("÷")} />
        <Btn label="×" variant="fn" onClick={() => setOperator("×")} />
        <Btn label="" variant="fn" onClick={backspace} icon={<Delete className="h-4.5 w-4.5" />} />

        <Btn label="7" onClick={() => inputDigit("7")} />
        <Btn label="8" onClick={() => inputDigit("8")} />
        <Btn label="9" onClick={() => inputDigit("9")} />
        <Btn label="−" variant="fn" onClick={() => setOperator("-")} />

        <Btn label="4" onClick={() => inputDigit("4")} />
        <Btn label="5" onClick={() => inputDigit("5")} />
        <Btn label="6" onClick={() => inputDigit("6")} />
        <Btn label="+" variant="fn" onClick={() => setOperator("+")} />

        <Btn label="1" onClick={() => inputDigit("1")} />
        <Btn label="2" onClick={() => inputDigit("2")} />
        <Btn label="3" onClick={() => inputDigit("3")} />
        <Btn label="=" variant="eq" onClick={equals} className="row-span-1" />

        <Btn label="±" onClick={() => setDisplay(display.startsWith("-") ? display.slice(1) : display === "0" ? "0" : "-" + display)} />
        <Btn label="0" onClick={() => inputDigit("0")} />
        <Btn label="." onClick={() => inputDigit(".")} />
        <Btn label="" onClick={() => {}} className="opacity-0 pointer-events-none" />
      </div>
    </div>
  );
}
