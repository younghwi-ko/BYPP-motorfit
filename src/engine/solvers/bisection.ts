export interface BisectionOptions {
  lower: number;
  upper: number;
  initialGuess?: number;
  functionTolerance?: number;
  tolerance?: number;
  maxIterations?: number;
}

export interface BisectionResult {
  root: number;
  residual: number;
  iterations: number;
}

/** A deterministic bracketed solver, independent of the combustion model. */
export function solveBisection(
  evaluate: (value: number) => number,
  {
    lower,
    upper,
    initialGuess,
    functionTolerance = 0,
    tolerance = 1e-15,
    maxIterations = 128,
  }: BisectionOptions,
): BisectionResult {
  let low = lower;
  let high = upper;
  let lowValue = evaluate(low);
  const highValue = evaluate(high);

  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) {
    throw new RangeError("Bisection endpoints must have finite residuals.");
  }
  if (lowValue === 0) return { root: low, residual: lowValue, iterations: 0 };
  if (highValue === 0) return { root: high, residual: highValue, iterations: 0 };
  if (Math.sign(lowValue) === Math.sign(highValue)) {
    throw new RangeError("Bisection interval does not bracket a root.");
  }

  if (initialGuess !== undefined) {
    if (initialGuess < lower || initialGuess > upper) {
      throw new RangeError("Bisection initial guess must lie inside the bracket.");
    }
    const initialResidual = evaluate(initialGuess);
    if (!Number.isFinite(initialResidual)) {
      throw new RangeError("Bisection initial residual must be finite.");
    }
    if (Math.abs(initialResidual) <= functionTolerance) {
      return { root: initialGuess, residual: initialResidual, iterations: 0 };
    }
  }

  let middle = low;
  let residual = lowValue;
  for (let iterations = 1; iterations <= maxIterations; iterations += 1) {
    middle = (low + high) / 2;
    residual = evaluate(middle);
    if (!Number.isFinite(residual)) throw new RangeError("Bisection residual must be finite.");
    if (
      Math.abs(residual) <= functionTolerance ||
      (high - low) / 2 <= tolerance
    ) {
      return { root: middle, residual, iterations };
    }
    if (Math.sign(residual) === Math.sign(lowValue)) {
      low = middle;
      lowValue = residual;
    } else {
      high = middle;
    }
  }
  return { root: middle, residual, iterations: maxIterations };
}
