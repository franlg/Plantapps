import type { AiService } from '@/services/contracts'
import { AiError } from '@/types'

/**
 * MARCADOR. Lo sustituye el agente de IA con la implementación real contra Gemini.
 * La interfaz `AiService` ya está congelada en @/services/contracts.
 */
export const aiService: AiService = {
  isConfigured() {
    return false
  },
  async analyze() {
    throw new AiError('El análisis con IA todavía no está disponible', 'desconocido')
  },
}