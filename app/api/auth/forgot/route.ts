import { handleForgotPasswordRequest } from '@/lib/recovery-handler'

export async function POST(request: Request) {
  return handleForgotPasswordRequest(request)
}
