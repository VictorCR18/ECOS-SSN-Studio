// src/utils/verificacao.ts
//
// Validade do cache de verificações de modelos (guardado no localStorage).

export interface RegistroVerificacao {
  estado: "ok" | "indisponivel";
  /** Epoch ms em que a verificação foi feita. */
  em: number;
  motivo?: string;
}

const HORA = 60 * 60 * 1000;
/** Modelo que respondeu: confiamos por mais tempo. */
export const VALIDADE_OK_MS = 12 * HORA;
/** Modelo fora do ar: reverificamos mais cedo, pois a NVIDIA/Groq às vezes os traz de volta. */
export const VALIDADE_INDISPONIVEL_MS = 3 * HORA;

/** Devolve o registro se ainda estiver válido; `undefined` se não existe ou expirou. */
export function registroValido(
  registro: RegistroVerificacao | undefined,
  agora = Date.now(),
): RegistroVerificacao | undefined {
  if (!registro) return undefined;
  const validade = registro.estado === "ok" ? VALIDADE_OK_MS : VALIDADE_INDISPONIVEL_MS;
  return agora - registro.em < validade ? registro : undefined;
}
