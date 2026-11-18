const COMPANY_PHONE = '+51987654321'

export const COMPANY_PHONE_DISPLAY = '+51 987 654 321'
export const COMPANY_PHONE_TEL = `tel:${COMPANY_PHONE}`
export const COMPANY_PHONE_WHATSAPP = `https://wa.me/${COMPANY_PHONE.slice(1)}`

/** Enlace a WhatsApp del servicio al cliente con un mensaje ya escrito. */
export function companyWhatsappWithMessage(message: string) {
  return `${COMPANY_PHONE_WHATSAPP}?text=${encodeURIComponent(message)}`
}
