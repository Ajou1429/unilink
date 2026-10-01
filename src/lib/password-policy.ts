const symbols = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~";

export const passwordChecks = [
  { label: "10자 이상", test: (value: string) => value.length >= 10 },
  { label: "영문 대문자", test: (value: string) => /[A-Z]/.test(value) },
  { label: "영문 소문자", test: (value: string) => /[a-z]/.test(value) },
  { label: "숫자", test: (value: string) => /[0-9]/.test(value) },
  { label: "특수기호", test: (value: string) => [...value].some((character) => symbols.includes(character)) },
] as const;

export function isValidPassword(value: string) {
  return passwordChecks.every(({ test }) => test(value));
}
